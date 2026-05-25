/**
 * Khi 1 notification realtime đến, ngoài việc prepend vào notification.store +
 * show toast + tăng badge, chúng ta cần refetch dữ liệu liên quan để UI hiển
 * thị NGAY (không cần user pull-to-refresh / rời màn rồi quay lại).
 *
 * Quan trọng: chỉ refetch khi user đang ở context tương ứng (đang xem group X /
 * trip Y) — nếu refetch group khác sẽ clobber `currentGroupMembers` /
 * `pendingJoinRequests` đang hiển thị. `currentGroupId` / `currentTripId` được
 * stores cập nhật khi `loadMembers` / `loadBalances` / `loadTrips` chạy.
 *
 * Pure — gọi qua `getState()` để không cần React context.
 */

import type { Notification } from '../services/notification.service';

import type { NotificationType } from './notificationFormat';

function fireAndForget(p: Promise<unknown>) {
  p.catch((e) => {
    if (__DEV__) console.warn('[NotifRoute] refetch failed:', e);
  });
}

/**
 * Tính route deep link cho 1 notification — dùng khi user tap FCM push hoặc
 * khi click bell card. KHÔNG refetch (đó là việc của `routeNotification`).
 *
 * Trả `null` cho type không có entity cụ thể (ví dụ member.invite_received
 * điều hướng về Home để xem ribbon, không phải route param-based).
 */
export function getDeepLinkForNotification(
  type: string,
  groupId: string | null,
  tripId: string | null
): string | null {
  switch (type) {
    case 'expense.created':
    case 'expense.edited':
    case 'expense.deleted':
    case 'payment.recorded':
    case 'payment.received':
    case 'trip.closed':
    case 'trip.cleared':
    case 'trip.reminder_settle':
      return tripId ? `/trips/${tripId}` : null;

    case 'member.join_requested':
    case 'member.role_change':
    case 'member.invite_accepted':
    case 'member.invite_declined':
    case 'trip.deleted':
      return groupId ? `/groups/${groupId}` : null;

    case 'member.join_approved':
      // Approved → user mới là member, dẫn vào group đó.
      return groupId ? `/groups/${groupId}` : '/';

    case 'member.join_rejected':
    case 'member.invite_received':
    case 'member.invite_revoked':
      // Home có ribbon "My pending join requests / invitations".
      return '/';

    default:
      return null;
  }
}

export function routeNotification(notif: Notification): void {
  dispatchNotificationRefetch(notif.type, notif.group_id, notif.trip_id);
}

/**
 * Cùng logic refetch như `routeNotification` nhưng nhận field rời — dùng từ
 * FCM tap handler ở root layout, nơi chỉ có payload data của push (không có
 * full Notification row).
 */
export function dispatchNotificationRefetch(
  rawType: string,
  groupId: string | null,
  tripId: string | null
): void {
  const type = rawType as NotificationType;

  // Lazy require để tránh circular deps (stores có thể import từ services dùng
  // các util chung).
  const { useGroupStore } = require('../stores/group.store') as typeof import('../stores/group.store');
  const { useTripStore } = require('../stores/trip.store') as typeof import('../stores/trip.store');

  const groupState = useGroupStore.getState();
  const tripState = useTripStore.getState();

  try {
    switch (type) {
      case 'member.join_requested': {
        // Admin đang ở màn group → refetch pending list để request hiển thị NGAY.
        if (groupId && groupState.currentGroupId === groupId) {
          fireAndForget(groupState.loadPendingRequests(groupId));
        }
        break;
      }

      case 'member.join_approved':
      case 'member.join_rejected': {
        // Người nhận noti là requester — refresh "my pending" để ribbon ở Home
        // update + refresh danh sách nhóm (approved → có nhóm mới).
        fireAndForget(groupState.loadMyPendingJoinRequests());
        if (type === 'member.join_approved') {
          fireAndForget(groupState.loadGroups());
        }
        // Nếu admin đang xem group đó → refresh members + pending.
        if (groupId && groupState.currentGroupId === groupId) {
          fireAndForget(groupState.loadMembers(groupId));
          fireAndForget(groupState.loadPendingRequests(groupId));
        }
        break;
      }

      case 'member.role_change': {
        if (groupId && groupState.currentGroupId === groupId) {
          fireAndForget(groupState.loadMembers(groupId));
        }
        break;
      }

      case 'member.invite_received':
      case 'member.invite_revoked': {
        // Người nhận = invitee. Refresh banner Home + dialog confirm data.
        // Realtime channel `group_invitations` cũng patch state, nhưng INSERT payload
        // không có group_name/inviter_name → load lại để có đầy đủ join data.
        fireAndForget(groupState.loadMyPendingInvitations());
        break;
      }

      case 'member.invite_accepted':
      case 'member.invite_declined': {
        // Người nhận = inviter (admin). Nếu đang xem group đó → refresh pending list
        // (invitation transition pending → terminal) + members (nếu accepted, member mới xuất hiện).
        if (groupId && groupState.currentGroupId === groupId) {
          fireAndForget(groupState.loadPendingInvitations(groupId));
          if (type === 'member.invite_accepted') {
            fireAndForget(groupState.loadMembers(groupId));
          }
        }
        break;
      }

      case 'expense.created':
      case 'expense.edited':
      case 'expense.deleted':
      case 'payment.recorded':
      case 'payment.received': {
        // Chỉ refetch khi user đang xem đúng trip — tránh clobber.
        if (tripId && tripState.currentTripId === tripId) {
          fireAndForget(tripState.loadBalances(tripId));
        }
        // Refresh group balance summary (Home card có thể thay đổi).
        fireAndForget(groupState.loadBalanceSummary());
        break;
      }

      case 'trip.closed':
      case 'trip.cleared':
      case 'trip.deleted': {
        // Refresh trip list của group nếu user đang xem group đó.
        if (groupId && tripState.currentTripsGroupId === groupId) {
          fireAndForget(tripState.loadTrips(groupId));
        }
        // Nếu user đang xem chính trip bị tác động → refresh balances
        // (trip.cleared/closed) để xóa expense/payment đã reset.
        if (tripId && tripState.currentTripId === tripId && type !== 'trip.deleted') {
          fireAndForget(tripState.loadBalances(tripId));
        }
        // Refresh group balance summary (Home card có thể thay đổi).
        fireAndForget(groupState.loadBalanceSummary());
        break;
      }

      default:
        break;
    }
  } catch (e) {
    if (__DEV__) console.warn('[NotifRoute] dispatch failed for', type, e);
  }
}
