import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import * as groupMemberRepo from '../repositories/groupMember.repo';
import * as tripRepo from '../repositories/trip.repo';
import * as userRepo from '../repositories/user.repo';
import { useAppStore } from '../stores/app.store';
import { tryServerThenLocal } from '../sync/fallback';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import { isNetworkError } from '../utils/network';
import { formatNotificationTitle } from '../utils/notificationFormat';
import { validatePositiveAmount } from '../utils/validate';
import { getAuthUserId } from './auth.helper';
import { assertRole } from './group.service';

export interface Payment {
  id: string;
  trip_id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  note: string | null;
  recorded_by: string;
  date: string;
  version: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Settlement {
  id: string;
  trip_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  generated_at: string;
}

/** Fetch payments for a trip — fallback SQLite mirror. */
export async function fetchPayments(tripId: string): Promise<Payment[]> {
  return tryServerThenLocal<Payment[]>(
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const db = getDatabase();
      const rows = await db.getAllAsync<Payment>(
        `SELECT * FROM payments
          WHERE trip_id = ? AND deleted_at IS NULL
          ORDER BY date DESC`,
        [tripId]
      );
      return rows;
    }
  );
}

/** Record a payment — BR-03: free-form, not bound to algorithm */
export async function createPayment(params: {
  tripId: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  note?: string;
  date?: string;
}): Promise<Payment> {
  const amountErr = validatePositiveAmount(params.amount);
  if (amountErr) throw new Error(amountErr);

  if (params.fromMemberId === params.toMemberId) {
    throw new Error('Người trả và người nhận không được giống nhau');
  }

  await assertRole(params.groupId, ['admin', 'member']);

  // UX fail-fast cho closed trip — tránh enqueue rồi server reject `trip_closed` → dead.
  // RPC `create_payment` validate đầy đủ (trip_not_found / trip_not_in_group / member_not_in_group)
  // nên KHÔNG cần verify thêm ở client. IDs đến từ UI control nên invalid case cực hiếm.
  const trip = await tripRepo.getById(params.tripId);
  if (trip?.status === 'closed') {
    throw new Error('Chuyến đã đóng, không thể ghi nhận thanh toán');
  }

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const paymentId = globalThis.crypto.randomUUID();
  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();
  const date = params.date || clientCreatedAt;
  const note = params.note || null;

  // Capture actor + member names từ SQLite local để format notification title.
  // Offline-safe: cả 2 path online/offline đều dùng cùng title, dispatcher replay sẽ
  // pass thẳng cho RPC create_payment (yêu cầu p_title_for_payer + p_title_for_receiver + p_actor_name).
  const actor = await userRepo.getById(userId);
  const actorName = actor?.displayName || 'Thành viên';
  const fromMember = await groupMemberRepo.getById(params.fromMemberId);
  const toMember = await groupMemberRepo.getById(params.toMemberId);
  const fromName = fromMember?.displayName || '';
  const toName = toMember?.displayName || '';
  const titleForPayer = formatNotificationTitle({
    type: 'payment.recorded',
    actorName,
    fromName,
    toName,
    amount: params.amount,
  });
  const titleForReceiver = formatNotificationTitle({
    type: 'payment.received',
    actorName,
    fromName,
    toName,
    amount: params.amount,
  });

  const enqueueLocal = async (): Promise<Payment> => {
    const db = getDatabase();
    await db.runAsync(
      `INSERT INTO payments
        (id, trip_id, group_id, from_member_id, to_member_id, amount, note,
         recorded_by, date, version, client_request_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        paymentId,
        params.tripId,
        params.groupId,
        params.fromMemberId,
        params.toMemberId,
        params.amount,
        note,
        userId,
        date,
        clientRequestId,
        clientCreatedAt,
        clientCreatedAt,
      ]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.CREATE_PAYMENT,
      entity_type: ENTITY_TYPES.PAYMENT,
      entity_id: paymentId,
      client_request_id: clientRequestId,
      payload: {
        id: paymentId,
        trip_id: params.tripId,
        group_id: params.groupId,
        from_member_id: params.fromMemberId,
        to_member_id: params.toMemberId,
        amount: params.amount,
        note,
        date,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
        title_for_payer: titleForPayer,
        title_for_receiver: titleForReceiver,
        actor_name: actorName,
      },
    });
    return {
      id: paymentId,
      trip_id: params.tripId,
      group_id: params.groupId,
      from_member_id: params.fromMemberId,
      to_member_id: params.toMemberId,
      amount: params.amount,
      note,
      recorded_by: userId,
      date,
      version: 1,
      client_request_id: clientRequestId,
      created_at: clientCreatedAt,
      updated_at: clientCreatedAt,
      deleted_at: null,
    };
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const { data, error } = await supabase
      .rpc('create_payment', {
        p_id: paymentId,
        p_trip_id: params.tripId,
        p_group_id: params.groupId,
        p_from_member_id: params.fromMemberId,
        p_to_member_id: params.toMemberId,
        p_amount: params.amount,
        p_note: note,
        p_date: date,
        p_client_request_id: clientRequestId,
        p_title_for_payer: titleForPayer,
        p_title_for_receiver: titleForReceiver,
        p_actor_name: actorName,
      })
      .single<Payment>();

    if (error) throw error;
    if (!data) throw new Error('Ghi nhận thanh toán thất bại');
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[createPayment] network fail, queueing offline');
      return enqueueLocal();
    }
    throw err;
  }
}

/**
 * Soft delete payment — admin only. Offline-first: idempotent qua delete_payment RPC.
 * Server-side RPC COALESCE(deleted_at, now()) đảm bảo replay 2 lần safe.
 */
export async function deletePayment(paymentId: string): Promise<void> {
  const clientRequestId = globalThis.crypto.randomUUID();
  const clientCreatedAt = new Date().toISOString();

  // Lookup local payment để check trip status + group authz.
  const db = getDatabase();
  const local = await db.getFirstAsync<{
    group_id: string;
    trip_id: string;
    from_member_id: string;
    to_member_id: string;
    amount: number;
    trip_status: string;
  }>(
    `SELECT p.group_id, p.trip_id, p.from_member_id, p.to_member_id, p.amount,
            t.status AS trip_status
       FROM payments p
       INNER JOIN trips t ON t.id = p.trip_id
      WHERE p.id = ?`,
    [paymentId]
  );
  if (!local) throw new Error('Thanh toán không tồn tại');
  if (local.trip_status === 'closed') {
    throw new Error('cannot_modify_closed_trip');
  }
  await assertRole(local.group_id, ['admin']);

  const enqueueLocal = async (): Promise<void> => {
    await db.runAsync(
      `UPDATE payments
          SET deleted_at = COALESCE(deleted_at, ?)
        WHERE id = ?`,
      [clientCreatedAt, paymentId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.DELETE_PAYMENT,
      entity_type: ENTITY_TYPES.PAYMENT,
      entity_id: paymentId,
      client_request_id: clientRequestId,
      payload: {
        payment_id: paymentId,
        client_request_id: clientRequestId,
        client_created_at: clientCreatedAt,
      },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { error } = await supabase.rpc('delete_payment', {
      p_payment_id: paymentId,
      p_client_request_id: clientRequestId,
      p_client_created_at: clientCreatedAt,
    });
    if (error) throw error;

    // Audit logged by RPC server-side. Notify không cần — payment.delete không phát notify.
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[deletePayment] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
}

// Re-export from utils for backward compatibility
export { calculateSettlements } from '../utils/settlement';
