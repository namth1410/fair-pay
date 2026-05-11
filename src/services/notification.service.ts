import { NOTIF_PAGE_SIZE } from '../config/constants';
import { supabase } from '../config/supabase';
import {
  formatNotificationTitle,
  getSettingKeyForType,
  type NotificationSettingKey,
  type NotificationType,
} from '../utils/notificationFormat';
import { getAuthUserId } from './auth.helper';
import type { UserSettings } from './user.service';

export {
  formatNotificationTitle,
  getSettingKeyForType,
  type NotificationSettingKey,
  type NotificationType,
};

export interface Notification {
  id: string;
  user_id: string;
  group_id: string | null;
  trip_id: string | null;
  type: string;
  actor_id: string | null;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  /** Optional, joined client-side for richer UI. */
  actor_name?: string;
  actor_photo_url?: string | null;
  group_name?: string;
}

export interface NotificationListFilter {
  /** Read state filter. */
  scope?: 'all' | 'unread';
  /** Multi-select group filter. Empty/undefined = no group filter. */
  groupIds?: string[];
}

// ── Recipient resolver ─────────────────────────────────────────────────────────

interface RecipientFilterParams {
  groupId: string;
  /** Loại trừ user thực hiện action — actor_id (users.id) hoặc null nếu hệ thống. */
  excludeUserId?: string | null;
  /** Setting key cần kiểm tra (vd: notify_activity). */
  settingKey: NotificationSettingKey;
}

/**
 * Resolve danh sách user_id (users.id) sẽ nhận notification cho 1 group event.
 * - Lọc thành viên đang active (left_at NULL).
 * - Bỏ thành viên ảo (is_virtual = true / user_id NULL).
 * - Bỏ actor.
 * - Bỏ user đã tắt toggle tương ứng trong settings.
 */
export async function getGroupRecipients(
  params: RecipientFilterParams
): Promise<string[]> {
  const { groupId, excludeUserId, settingKey } = params;

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, is_virtual, left_at, users:user_id(id, settings)')
    .eq('group_id', groupId)
    .is('left_at', null);

  if (!members?.length) return [];

  type Row = {
    user_id: string | null;
    is_virtual: boolean | number | null;
    users:
      | { id: string; settings: Partial<UserSettings> | null }
      | { id: string; settings: Partial<UserSettings> | null }[]
      | null;
  };

  const out: string[] = [];
  for (const raw of members as Row[]) {
    if (!raw.user_id) continue;
    if (raw.is_virtual) continue; // truthy 0/1/false/true
    if (excludeUserId && raw.user_id === excludeUserId) continue;
    const userRel = Array.isArray(raw.users) ? raw.users[0] : raw.users;
    const settings = userRel?.settings ?? null;
    // Default true nếu chưa set (user mới chưa migrate hoặc setting null).
    const enabled = settings?.[settingKey] ?? true;
    if (!enabled) continue;
    out.push(raw.user_id);
  }
  return out;
}

// ── Core writer ────────────────────────────────────────────────────────────────

interface CreateNotificationsParams {
  type: NotificationType;
  recipients: string[]; // users.id list
  actorId: string | null;
  groupId: string | null;
  tripId?: string | null;
  title: string;
  /** Khi dedup gộp, dùng để build lại title "actor đã thêm N khoản chi". */
  actorName?: string;
  body?: string;
  data?: Record<string, unknown>;
}

/**
 * Insert một loạt notifications cho nhiều recipients qua RPC `create_notifications_batch`.
 * RPC handle dedup 10 phút atomic (UPDATE existing chưa-đọc hoặc INSERT mới).
 * Actor luôn = auth_user_id() ở DB-side (anti-spoof) — `params.actorId` chỉ
 * dùng client-side trước khi gọi (vd: exclude actor khỏi recipients).
 *
 * Failure-tolerant — gọi từ service mutation, lỗi không block main flow:
 * caller PHẢI bọc try/catch (giống pattern logAction).
 */
export async function createNotifications(
  params: CreateNotificationsParams
): Promise<void> {
  const recipients = Array.from(new Set(params.recipients)).filter(Boolean);
  if (!recipients.length) return;

  const { error } = await supabase.rpc('create_notifications_batch', {
    p_recipients: recipients,
    p_type: params.type,
    p_group_id: params.groupId ?? null,
    p_trip_id: params.tripId ?? null,
    p_title: params.title,
    p_actor_name: params.actorName ?? 'Ai đó',
    p_body: params.body ?? null,
    p_data: params.data ?? {},
  });
  if (error) throw error;
}

// ── Reads ──────────────────────────────────────────────────────────────────────

/**
 * Fetch notifications for the current user, with cursor pagination.
 * Trả về danh sách kèm join actor (display_name + photo_url) và group name.
 */
export async function fetchNotifications(opts?: {
  cursor?: string | null; // created_at của row cuối page trước
  limit?: number;
  filter?: NotificationListFilter;
}): Promise<Notification[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const limit = opts?.limit ?? NOTIF_PAGE_SIZE;
  const filter = opts?.filter;

  let query = supabase
    .from('notifications')
    .select('*, actor:actor_id(display_name, photo_url), group:group_id(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.cursor) {
    query = query.lt('created_at', opts.cursor);
  }
  if (filter?.scope === 'unread') {
    query = query.is('read_at', null);
  }
  if (filter?.groupIds && filter.groupIds.length > 0) {
    query = query.in('group_id', filter.groupIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = Notification & {
    actor: { display_name: string; photo_url: string | null } | null;
    group: { name: string } | null;
  };

  return (data as Row[]).map((r) => ({
    ...r,
    actor_name: r.actor?.display_name,
    actor_photo_url: r.actor?.photo_url ?? null,
    group_name: r.group?.name,
  }));
}

/** Đếm số notif chưa đọc của user hiện tại (badge). */
export async function getUnreadCount(): Promise<number> {
  const userId = await getAuthUserId();
  if (!userId) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

export async function markAsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const userId = await getAuthUserId();
  if (!userId) return;
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', userId)
    .is('read_at', null);
}

export async function markAllAsRead(): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}

export async function deleteNotification(id: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;
  await supabase.from('notifications').delete().eq('id', id).eq('user_id', userId);
}

// ── High-level helpers gọi từ service mutation ─────────────────────────────────
// Tất cả đều bọc try/catch im lặng — KHÔNG block main flow nếu fail.

interface ExpenseEventInput {
  groupId: string;
  tripId: string;
  actorId: string;
  actorName: string;
  expenseId: string;
  expenseTitle: string;
  amount: number;
}

export async function notifyExpenseEvent(
  type: 'expense.created' | 'expense.edited' | 'expense.deleted',
  input: ExpenseEventInput
): Promise<void> {
  try {
    const recipients = await getGroupRecipients({
      groupId: input.groupId,
      excludeUserId: input.actorId,
      settingKey: 'notify_activity',
    });
    if (!recipients.length) return;
    const title = formatNotificationTitle({
      type,
      actorName: input.actorName,
      targetTitle: input.expenseTitle,
      amount: type === 'expense.created' ? input.amount : undefined,
    });
    await createNotifications({
      type,
      recipients,
      actorId: input.actorId,
      actorName: input.actorName,
      groupId: input.groupId,
      tripId: input.tripId,
      title,
      data: {
        target_id: input.expenseId,
        expense_title: input.expenseTitle,
        amount: input.amount,
      },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] expense event failed:', e);
  }
}

interface PaymentEventInput {
  groupId: string;
  tripId: string;
  actorId: string;
  actorName: string;
  paymentId: string;
  fromMemberId: string; // group_members.id
  toMemberId: string;   // group_members.id
  amount: number;
}

export async function notifyPaymentRecorded(input: PaymentEventInput): Promise<void> {
  try {
    // Resolve user_id + display_name của from/to (1 query batch)
    const { data: members } = await supabase
      .from('group_members')
      .select('id, user_id, display_name, is_virtual')
      .in('id', [input.fromMemberId, input.toMemberId]);

    const byId = new Map<
      string,
      { user_id: string | null; display_name: string; is_virtual: boolean | number | null }
    >();
    for (const m of (members ?? []) as {
      id: string;
      user_id: string | null;
      display_name: string;
      is_virtual: boolean | number | null;
    }[]) {
      byId.set(m.id, m);
    }

    const fromMember = byId.get(input.fromMemberId);
    const toMember = byId.get(input.toMemberId);
    const fromName = fromMember?.display_name ?? '';
    const toName = toMember?.display_name ?? '';
    const fromUserId = fromMember?.user_id ?? null;
    const toUserId = toMember?.user_id ?? null;

    // Recipients = from + to (loại actor + virtual + tắt setting)
    const candidates = new Set<string>();
    if (fromUserId && fromUserId !== input.actorId) candidates.add(fromUserId);
    if (toUserId && toUserId !== input.actorId) candidates.add(toUserId);

    if (!candidates.size) return;

    // Filter theo notify_payment
    const { data: usersRows } = await supabase
      .from('users')
      .select('id, settings')
      .in('id', Array.from(candidates));
    const allowed = new Set(
      (usersRows ?? [])
        .filter(
          (u: { settings: Partial<UserSettings> | null }) => u.settings?.notify_payment ?? true
        )
        .map((u: { id: string }) => u.id)
    );

    if (!allowed.size) return;

    // Per-recipient title: người nhận → "X đã trả bạn …", còn lại → "actor ghi nhận …"
    const tasks: Promise<unknown>[] = [];
    for (const uid of Array.from(allowed)) {
      const isReceiver = uid === toUserId;
      const type: NotificationType = isReceiver ? 'payment.received' : 'payment.recorded';
      const title = formatNotificationTitle({
        type,
        actorName: input.actorName,
        fromName,
        toName,
        amount: input.amount,
      });
      tasks.push(
        createNotifications({
          type,
          recipients: [uid],
          actorId: input.actorId,
          actorName: input.actorName,
          groupId: input.groupId,
          tripId: input.tripId,
          title,
          data: {
            target_id: input.paymentId,
            from_name: fromName,
            to_name: toName,
            amount: input.amount,
          },
        })
      );
    }
    await Promise.all(tasks);
  } catch (e) {
    if (__DEV__) console.warn('[Notif] payment event failed:', e);
  }
}

interface JoinRequestInput {
  groupId: string;
  groupName: string;
  requesterUserId: string; // users.id của người xin vào
  requesterName: string;
}

export async function notifyJoinRequested(input: JoinRequestInput): Promise<void> {
  try {
    // Recipients = admins (loại requester)
    const { data: admins } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', input.groupId)
      .eq('role', 'admin')
      .is('left_at', null)
      .not('user_id', 'is', null);

    const adminIds = (admins ?? [])
      .map((m: { user_id: string | null }) => m.user_id)
      .filter((v): v is string => !!v && v !== input.requesterUserId);

    if (!adminIds.length) return;

    // Filter theo notify_member
    const { data: usersRows } = await supabase
      .from('users')
      .select('id, settings')
      .in('id', adminIds);
    const allowed = (usersRows ?? [])
      .filter(
        (u: { settings: Partial<UserSettings> | null }) => u.settings?.notify_member ?? true
      )
      .map((u: { id: string }) => u.id);

    if (!allowed.length) return;

    const title = formatNotificationTitle({
      type: 'member.join_requested',
      actorName: input.requesterName,
      groupName: input.groupName,
    });
    await createNotifications({
      type: 'member.join_requested',
      recipients: allowed,
      actorId: input.requesterUserId,
      actorName: input.requesterName,
      groupId: input.groupId,
      title,
      data: { group_name: input.groupName },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] join_requested failed:', e);
  }
}

interface JoinResolvedInput {
  groupId: string;
  groupName: string;
  reviewerId: string;
  requesterUserId: string;
}

export async function notifyJoinResolved(
  type: 'member.join_approved' | 'member.join_rejected',
  input: JoinResolvedInput
): Promise<void> {
  try {
    if (input.requesterUserId === input.reviewerId) return;
    // Check requester có bật notify_member không
    const { data: userRow } = await supabase
      .from('users')
      .select('settings')
      .eq('id', input.requesterUserId)
      .maybeSingle();
    const enabled = (userRow?.settings as Partial<UserSettings> | null)?.notify_member ?? true;
    if (!enabled) return;

    const title = formatNotificationTitle({ type, actorName: '', groupName: input.groupName });
    await createNotifications({
      type,
      recipients: [input.requesterUserId],
      actorId: input.reviewerId,
      groupId: input.groupId,
      title,
      data: { group_name: input.groupName },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] join_resolved failed:', e);
  }
}

interface RoleChangeInput {
  groupId: string;
  actorId: string;
  targetUserId: string; // users.id của member bị đổi role (null nếu virtual)
  newRole: 'admin' | 'member';
}

export async function notifyRoleChange(input: RoleChangeInput): Promise<void> {
  try {
    if (!input.targetUserId || input.targetUserId === input.actorId) return;
    const { data: userRow } = await supabase
      .from('users')
      .select('settings')
      .eq('id', input.targetUserId)
      .maybeSingle();
    const enabled = (userRow?.settings as Partial<UserSettings> | null)?.notify_member ?? true;
    if (!enabled) return;

    const title = formatNotificationTitle({
      type: 'member.role_change',
      actorName: '',
      role: input.newRole,
    });
    await createNotifications({
      type: 'member.role_change',
      recipients: [input.targetUserId],
      actorId: input.actorId,
      groupId: input.groupId,
      title,
      data: { role: input.newRole },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] role_change failed:', e);
  }
}

interface TripClosedInput {
  groupId: string;
  tripId: string;
  tripName: string;
  actorId: string;
  actorName: string;
}

export async function notifyTripClosed(input: TripClosedInput): Promise<void> {
  try {
    const recipients = await getGroupRecipients({
      groupId: input.groupId,
      excludeUserId: input.actorId,
      settingKey: 'notify_activity',
    });
    if (!recipients.length) return;
    const title = formatNotificationTitle({
      type: 'trip.closed',
      actorName: input.actorName,
      tripName: input.tripName,
    });
    await createNotifications({
      type: 'trip.closed',
      recipients,
      actorId: input.actorId,
      actorName: input.actorName,
      groupId: input.groupId,
      tripId: input.tripId,
      title,
      data: { target_id: input.tripId, trip_name: input.tripName },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] trip_closed failed:', e);
  }
}

export async function notifyTripCleared(input: TripClosedInput): Promise<void> {
  try {
    const recipients = await getGroupRecipients({
      groupId: input.groupId,
      excludeUserId: input.actorId,
      settingKey: 'notify_activity',
    });
    if (!recipients.length) return;
    const title = formatNotificationTitle({
      type: 'trip.cleared',
      actorName: input.actorName,
      tripName: input.tripName,
    });
    await createNotifications({
      type: 'trip.cleared',
      recipients,
      actorId: input.actorId,
      actorName: input.actorName,
      groupId: input.groupId,
      tripId: input.tripId,
      title,
      data: { target_id: input.tripId, trip_name: input.tripName },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] trip_cleared failed:', e);
  }
}

export async function notifyTripDeleted(input: TripClosedInput): Promise<void> {
  try {
    const recipients = await getGroupRecipients({
      groupId: input.groupId,
      excludeUserId: input.actorId,
      settingKey: 'notify_activity',
    });
    if (!recipients.length) return;
    const title = formatNotificationTitle({
      type: 'trip.deleted',
      actorName: input.actorName,
      tripName: input.tripName,
    });
    await createNotifications({
      type: 'trip.deleted',
      recipients,
      actorId: input.actorId,
      actorName: input.actorName,
      groupId: input.groupId,
      tripId: input.tripId,
      title,
      data: { target_id: input.tripId, trip_name: input.tripName },
    });
  } catch (e) {
    if (__DEV__) console.warn('[Notif] trip_deleted failed:', e);
  }
}
