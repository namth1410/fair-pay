import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import { tryServerThenLocal } from '../sync/fallback';
import { getAuthUserId } from './auth.helper';

export interface AuditLog {
  id: string;
  group_id: string;
  trip_id: string | null;
  action: string;
  actor_id: string;
  target_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string;
}

const ACTION_LABELS: Record<string, string> = {
  'expense.create': 'Thêm khoản chi',
  'expense.edit': 'Sửa khoản chi',
  'expense.delete': 'Xóa khoản chi',
  'payment.create': 'Ghi nhận thanh toán',
  'payment.delete': 'Xóa thanh toán',
  'trip.create': 'Tạo chuyến đi',
  'trip.close': 'Đóng chuyến đi',
  'trip.reopen': 'Mở lại chuyến đi',
  'trip.rename': 'Đổi tên chuyến đi',
  'trip.clear': 'Reset chuyến đi',
  'trip.delete': 'Xóa chuyến đi',
  'member.role_change':    'Thay đổi vai trò',
  'member.join_approved':  'Duyệt yêu cầu tham gia',
  'member.join_rejected':  'Từ chối yêu cầu tham gia',
  'member.virtual_add':    'Thêm thành viên ảo',
  'member.rename':         'Đổi tên thành viên',
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

/** Fetch audit logs for a trip — fallback SQLite mirror với JOIN users. */
export async function fetchAuditLogs(tripId: string): Promise<AuditLog[]> {
  return tryServerThenLocal<AuditLog[]>(
    async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data?.length) return [];

      const actorIds = [...new Set(data.map((l) => l.actor_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', actorIds);

      const nameMap: Record<string, string> = {};
      users?.forEach((u) => (nameMap[u.id] = u.display_name));

      return data.map((log) => ({
        ...log,
        actor_name: nameMap[log.actor_id] || 'Ẩn danh',
      }));
    },
    async () => {
      const db = getDatabase();
      // SQLite trả before_data/after_data as TEXT; service AuditLog expects object.
      type RawRow = Omit<AuditLog, 'before_data' | 'after_data'> & {
        before_data: string | null;
        after_data: string | null;
        actor_display_name: string | null;
      };
      const rows = await db.getAllAsync<RawRow>(
        `SELECT a.*, u.display_name AS actor_display_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.actor_id
          WHERE a.trip_id = ?
          ORDER BY COALESCE(a.client_created_at, a.created_at) DESC
          LIMIT 50`,
        [tripId]
      );
      return rows.map((r) => ({
        id: r.id,
        group_id: r.group_id,
        trip_id: r.trip_id,
        action: r.action,
        actor_id: r.actor_id,
        target_id: r.target_id,
        before_data: r.before_data ? JSON.parse(r.before_data) : null,
        after_data: r.after_data ? JSON.parse(r.after_data) : null,
        created_at: r.created_at,
        actor_name: r.actor_display_name || 'Ẩn danh',
      }));
    }
  );
}

/**
 * Write an audit log entry.
 * Called after expense/payment create/delete operations.
 */
export async function logAction(params: {
  groupId: string;
  tripId?: string;
  action: string;
  targetId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return;

    await supabase.from('audit_logs').insert({
      group_id: params.groupId,
      trip_id: params.tripId || null,
      action: params.action,
      actor_id: userId,
      target_id: params.targetId,
      before_data: params.beforeData || null,
      after_data: params.afterData || null,
    });
  } catch {
    // Audit log failures should not break the main flow
    console.warn('[Audit] Failed to log action:', params.action);
  }
}
