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

export function routeNotification(notif: Notification): void {
  const type = notif.type as NotificationType;
  const groupId = notif.group_id;
  const tripId = notif.trip_id;

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
