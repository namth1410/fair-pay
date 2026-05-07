import { supabase } from '../config/supabase';
import { validatePositiveAmount } from '../utils/validate';
import { logAction } from './audit.service';
import { getAuthUserId } from './auth.helper';
import { assertRole } from './group.service';
import { notifyPaymentRecorded } from './notification.service';

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
  created_at: string;
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

/** Fetch payments for a trip */
export async function fetchPayments(tripId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
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

  // Verify trip thuộc đúng group + chưa đóng
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('group_id, status')
    .eq('id', params.tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tripErr) throw tripErr;
  if (!trip || trip.group_id !== params.groupId) {
    throw new Error('Chuyến không thuộc nhóm này');
  }
  if (trip.status === 'closed') {
    throw new Error('Chuyến đã đóng, không thể ghi nhận thanh toán');
  }

  // Verify cả from và to đều là member của group (chống cross-group injection)
  const { data: members } = await supabase
    .from('group_members')
    .select('id')
    .in('id', [params.fromMemberId, params.toMemberId])
    .eq('group_id', params.groupId);
  if (!members || members.length !== 2) {
    throw new Error('Người trả/người nhận không thuộc nhóm này');
  }

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('payments')
    .insert({
      trip_id: params.tripId,
      group_id: params.groupId,
      from_member_id: params.fromMemberId,
      to_member_id: params.toMemberId,
      amount: params.amount,
      note: params.note || null,
      date: params.date || new Date().toISOString(),
      recorded_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  // Audit + notify (best-effort)
  const { data: actor } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const actorName = actor?.display_name || 'Thành viên';
  await Promise.all([
    logAction({
      groupId: params.groupId,
      tripId: params.tripId,
      action: 'payment.create',
      targetId: data.id,
      afterData: {
        from_member_id: params.fromMemberId,
        to_member_id: params.toMemberId,
        amount: params.amount,
      },
    }),
    notifyPaymentRecorded({
      groupId: params.groupId,
      tripId: params.tripId,
      actorId: userId,
      actorName,
      paymentId: data.id,
      fromMemberId: params.fromMemberId,
      toMemberId: params.toMemberId,
      amount: params.amount,
    }),
  ]);

  return data;
}

/** Soft delete payment — admin only */
export async function deletePayment(paymentId: string): Promise<void> {
  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('group_id, trip_id, from_member_id, to_member_id, amount')
    .eq('id', paymentId)
    .single();
  if (fetchErr || !payment) throw new Error('Thanh toán không tồn tại');
  await assertRole(payment.group_id, ['admin']);

  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', paymentId);

  if (error) throw error;

  // Audit (best-effort) — payment.delete không có recipient notify
  await logAction({
    groupId: payment.group_id,
    tripId: payment.trip_id,
    action: 'payment.delete',
    targetId: paymentId,
    beforeData: {
      from_member_id: payment.from_member_id,
      to_member_id: payment.to_member_id,
      amount: payment.amount,
    },
  });
}

// Re-export from utils for backward compatibility
export { calculateSettlements } from '../utils/settlement';
