/**
 * Pure helpers cho notifications — render title VN + map type → setting key.
 * KHÔNG import supabase / native modules để jest (node env) test được trực tiếp.
 */
import { formatVND } from './format';

export type NotificationType =
  | 'expense.created'
  | 'expense.edited'
  | 'expense.deleted'
  | 'payment.recorded'
  | 'payment.received'
  | 'member.join_requested'
  | 'member.join_approved'
  | 'member.join_rejected'
  | 'member.role_change'
  | 'trip.closed'
  | 'trip.cleared'
  | 'trip.deleted'
  | 'trip.reminder_settle';

export type NotificationSettingKey =
  | 'notify_activity'
  | 'notify_payment'
  | 'notify_member'
  | 'notify_smart';

/** Map notification type → which UserSettings toggle gates it. */
export function getSettingKeyForType(type: NotificationType): NotificationSettingKey {
  if (type === 'trip.reminder_settle') return 'notify_smart';
  if (type.startsWith('payment.')) return 'notify_payment';
  if (type.startsWith('member.')) return 'notify_member';
  return 'notify_activity';
}

/**
 * Build the Vietnamese title displayed in the list.
 * Pure — easy to unit-test and reuse in dedup updates.
 */
export function formatNotificationTitle(params: {
  type: NotificationType;
  actorName: string;
  targetTitle?: string;
  amount?: number;
  groupName?: string;
  fromName?: string;
  toName?: string;
  role?: 'admin' | 'member';
  tripName?: string;
  count?: number;
}): string {
  const {
    type,
    actorName,
    targetTitle,
    amount,
    groupName,
    fromName,
    toName,
    role,
    tripName,
    count = 1,
  } = params;
  const money = typeof amount === 'number' ? formatVND(amount) : '';

  switch (type) {
    case 'expense.created':
      return count > 1
        ? `${actorName} đã thêm ${count} khoản chi`
        : `${actorName} đã thêm khoản chi ${targetTitle ?? ''}${money ? ` (${money})` : ''}`.trim();
    case 'expense.edited':
      return count > 1
        ? `${actorName} đã sửa ${count} khoản chi`
        : `${actorName} đã sửa khoản chi ${targetTitle ?? ''}`.trim();
    case 'expense.deleted':
      return count > 1
        ? `${actorName} đã xóa ${count} khoản chi`
        : `${actorName} đã xóa khoản chi ${targetTitle ?? ''}`.trim();
    case 'payment.recorded':
      return `${actorName} ghi nhận ${fromName ?? ''} → ${toName ?? ''} trả ${money}`;
    case 'payment.received':
      return `${fromName ?? actorName} đã trả bạn ${money}`;
    case 'member.join_requested':
      return `${actorName} muốn tham gia nhóm ${groupName ?? ''}`.trim();
    case 'member.join_approved':
      return `Bạn đã được duyệt vào nhóm ${groupName ?? ''}`.trim();
    case 'member.join_rejected':
      return `Yêu cầu vào nhóm ${groupName ?? ''} bị từ chối`.trim();
    case 'member.role_change':
      return `Bạn được chuyển sang ${role === 'admin' ? 'quản trị viên' : 'thành viên'}`;
    case 'trip.closed':
      return `Chuyến đi ${tripName ?? ''} đã được đóng`.trim();
    case 'trip.cleared':
      return `${actorName} đã reset chuyến đi ${tripName ?? ''}`.trim();
    case 'trip.deleted':
      return `${actorName} đã xóa chuyến đi ${tripName ?? ''}`.trim();
    case 'trip.reminder_settle':
      return `Bạn còn nợ ${toName ?? ''} ${money} trong ${tripName ?? 'chuyến đi'}`.trim();
    default:
      return actorName;
  }
}
