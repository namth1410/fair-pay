/**
 * Tests cho notification helpers — chỉ test pure functions (không touch Supabase).
 * Spec: docs/business-requirements.md §11.x + docs/technical-specification.md §6
 */
import {
  formatNotificationTitle,
  getSettingKeyForType,
  type NotificationType,
} from '../utils/notificationFormat';

describe('getSettingKeyForType — map notification type → setting toggle', () => {
  it('expense.* → notify_activity', () => {
    expect(getSettingKeyForType('expense.created')).toBe('notify_activity');
    expect(getSettingKeyForType('expense.edited')).toBe('notify_activity');
    expect(getSettingKeyForType('expense.deleted')).toBe('notify_activity');
  });

  it('trip.closed → notify_activity', () => {
    expect(getSettingKeyForType('trip.closed')).toBe('notify_activity');
  });

  it('payment.* → notify_payment', () => {
    expect(getSettingKeyForType('payment.recorded')).toBe('notify_payment');
    expect(getSettingKeyForType('payment.received')).toBe('notify_payment');
  });

  it('member.* → notify_member', () => {
    expect(getSettingKeyForType('member.join_requested')).toBe('notify_member');
    expect(getSettingKeyForType('member.join_approved')).toBe('notify_member');
    expect(getSettingKeyForType('member.join_rejected')).toBe('notify_member');
    expect(getSettingKeyForType('member.invite_received')).toBe('notify_member');
    expect(getSettingKeyForType('member.invite_accepted')).toBe('notify_member');
    expect(getSettingKeyForType('member.invite_declined')).toBe('notify_member');
    expect(getSettingKeyForType('member.invite_revoked')).toBe('notify_member');
    expect(getSettingKeyForType('member.role_change')).toBe('notify_member');
  });

  it('trip.reminder_settle → notify_smart', () => {
    expect(getSettingKeyForType('trip.reminder_settle')).toBe('notify_smart');
  });
});

describe('formatNotificationTitle — render Vietnamese title', () => {
  it('expense.created — single', () => {
    const title = formatNotificationTitle({
      type: 'expense.created',
      actorName: 'Nam',
      targetTitle: 'Cà phê',
      amount: 150_000,
    });
    expect(title).toBe('Nam đã thêm khoản chi Cà phê (150.000đ)');
  });

  it('expense.created — dedup count', () => {
    const title = formatNotificationTitle({
      type: 'expense.created',
      actorName: 'Nam',
      count: 5,
    });
    expect(title).toBe('Nam đã thêm 5 khoản chi');
  });

  it('expense.edited — count = 1 không hiện amount', () => {
    const title = formatNotificationTitle({
      type: 'expense.edited',
      actorName: 'Lan',
      targetTitle: 'Tiền xe',
    });
    expect(title).toBe('Lan đã sửa khoản chi Tiền xe');
  });

  it('payment.received — viết theo POV người nhận', () => {
    const title = formatNotificationTitle({
      type: 'payment.received',
      actorName: 'An',
      fromName: 'An',
      toName: 'Bình',
      amount: 200_000,
    });
    expect(title).toBe('An đã trả bạn 200.000đ');
  });

  it('payment.recorded — actor không phải from/to', () => {
    const title = formatNotificationTitle({
      type: 'payment.recorded',
      actorName: 'Admin',
      fromName: 'A',
      toName: 'B',
      amount: 50_000,
    });
    expect(title).toBe('Admin ghi nhận A → B trả 50.000đ');
  });

  it('member.join_requested', () => {
    const title = formatNotificationTitle({
      type: 'member.join_requested',
      actorName: 'Minh',
      groupName: 'Phượt Đà Nẵng',
    });
    expect(title).toBe('Minh muốn tham gia nhóm Phượt Đà Nẵng');
  });

  it('member.join_approved — không cần actorName', () => {
    const title = formatNotificationTitle({
      type: 'member.join_approved',
      actorName: '',
      groupName: 'Bữa trưa',
    });
    expect(title).toBe('Bạn đã được duyệt vào nhóm Bữa trưa');
  });

  it('member.join_rejected', () => {
    const title = formatNotificationTitle({
      type: 'member.join_rejected',
      actorName: '',
      groupName: 'Phượt',
    });
    expect(title).toBe('Yêu cầu vào nhóm Phượt bị từ chối');
  });

  it('member.invite_received', () => {
    const title = formatNotificationTitle({
      type: 'member.invite_received',
      actorName: 'Nam',
      groupName: 'Phượt Đà Nẵng',
    });
    expect(title).toBe('Nam mời bạn vào nhóm Phượt Đà Nẵng');
  });

  it('member.invite_accepted', () => {
    const title = formatNotificationTitle({
      type: 'member.invite_accepted',
      actorName: 'Lan',
      groupName: 'Bữa trưa',
    });
    expect(title).toBe('Lan đã chấp nhận lời mời vào nhóm Bữa trưa');
  });

  it('member.invite_declined', () => {
    const title = formatNotificationTitle({
      type: 'member.invite_declined',
      actorName: 'Minh',
      groupName: 'Phượt',
    });
    expect(title).toBe('Minh đã từ chối lời mời vào nhóm Phượt');
  });

  it('member.invite_revoked', () => {
    const title = formatNotificationTitle({
      type: 'member.invite_revoked',
      actorName: 'Admin',
      groupName: 'Hà Nội',
    });
    expect(title).toBe('Lời mời vào nhóm Hà Nội đã bị thu hồi');
  });

  it('member.role_change — admin', () => {
    const title = formatNotificationTitle({
      type: 'member.role_change',
      actorName: '',
      role: 'admin',
    });
    expect(title).toBe('Bạn được chuyển sang quản trị viên');
  });

  it('member.role_change — member', () => {
    const title = formatNotificationTitle({
      type: 'member.role_change',
      actorName: '',
      role: 'member',
    });
    expect(title).toBe('Bạn được chuyển sang thành viên');
  });

  it('trip.closed', () => {
    const title = formatNotificationTitle({
      type: 'trip.closed',
      actorName: 'Admin',
      tripName: 'Đà Nẵng 2026',
    });
    expect(title).toBe('Chuyến đi Đà Nẵng 2026 đã được đóng');
  });

  it('trip.reminder_settle — smart suggestion', () => {
    const title = formatNotificationTitle({
      type: 'trip.reminder_settle',
      actorName: '',
      toName: 'Lan',
      amount: 250_000,
      tripName: 'Hà Nội',
    });
    expect(title).toBe('Bạn còn nợ Lan 250.000đ trong Hà Nội');
  });

  it('amount = 0 không thêm ngoặc', () => {
    const title = formatNotificationTitle({
      type: 'expense.created',
      actorName: 'X',
      targetTitle: 'Free',
      amount: undefined,
    });
    expect(title).toBe('X đã thêm khoản chi Free');
  });

  it('mọi NotificationType đều có format không throw', () => {
    const all: NotificationType[] = [
      'expense.created',
      'expense.edited',
      'expense.deleted',
      'payment.recorded',
      'payment.received',
      'member.join_requested',
      'member.join_approved',
      'member.join_rejected',
      'member.invite_received',
      'member.invite_accepted',
      'member.invite_declined',
      'member.invite_revoked',
      'member.role_change',
      'trip.closed',
      'trip.reminder_settle',
    ];
    for (const type of all) {
      const out = formatNotificationTitle({ type, actorName: 'A' });
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
  });
});
