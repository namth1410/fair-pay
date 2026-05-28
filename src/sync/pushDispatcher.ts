// PushDispatcher — map op_type → Supabase RPC/INSERT call.
//
// Mỗi handler nhận payload (đã parse JSON), gọi server, trả về data hoặc throw.
// PushWorker catch + classify error qua syncQueue.handleError.
//
// Lưu ý:
//   - Server-side RPCs (create_expense, update_group, ...) đã handle audit + notify
//     atomic, nên dispatcher KHÔNG gọi logAction/notify từ client lúc replay.
//   - p_client_request_id luôn truyền để idempotency check chống duplicate
//     khi retry queue item đã thành công nhưng client không nhận response.

import { supabase } from '../config/supabase';
import { OP_TYPES, type OpType } from './types';

// ─── Payload types từng op ─────────────────────────────────────────────────
interface CreateGroupPayload {
  id: string;
  name: string;
  admin_member_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface CreateExpensePayload {
  id: string;
  trip_id: string;
  group_id: string;
  title: string;
  amount: number;
  category: string;
  paid_by: string;
  split_type: 'equal' | 'ratio' | 'custom';
  date: string;
  note: string | null;
  image_url: string | null;
  splits: Array<{ member_id: string; amount: number }>;
  client_request_id: string;
  client_created_at: string;
  initial_title: string;
  actor_name: string;
}

interface CreateTripPayload {
  id: string;
  group_id: string;
  name: string;
  type: 'travel' | 'meal' | 'event' | 'other';
  client_request_id: string;
  client_created_at: string;
}

interface CreatePaymentPayload {
  id: string;
  trip_id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  note: string | null;
  date: string;
  client_request_id: string;
  client_created_at: string;
  title_for_payer: string;
  title_for_receiver: string;
  actor_name: string;
}

interface CreatePresetPayload {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  category: string;
  trip_id: string | null;
  paid_by_member_id: string | null;
  split_type: string | null;
  splits_data: unknown[] | null;
  client_request_id: string;
  client_created_at: string;
}

interface UpdatePresetPayload {
  preset_id: string;
  title: string;
  amount: number;
  category: string;
  trip_id: string | null;
  paid_by_member_id: string | null;
  split_type: string | null;
  splits_data: unknown[] | null;
  base_version: number;
  client_request_id: string;
}

interface DeletePresetPayload {
  preset_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface AddVirtualMemberPayload {
  id: string;
  group_id: string;
  display_name: string;
  client_request_id: string;
  client_created_at: string;
}

interface ClearTripPayload {
  trip_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface DeleteTripPayload {
  trip_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface RemoveMemberPayload {
  member_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface DeleteGroupPayload {
  group_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface DeleteNotificationPayload {
  notification_id: string;
  client_request_id: string;
}

interface DeleteExpensePayload {
  expense_id: string;
  actor_name: string;
  client_request_id: string;
  client_created_at: string;
}

interface DeletePaymentPayload {
  payment_id: string;
  client_request_id: string;
  client_created_at: string;
}

interface UpdateGroupPayload {
  group_id: string;
  name: string | null;
  avatar_url: string | null;
  base_version: number;
  client_request_id: string;
  client_created_at: string;
}

interface UpdateTripNamePayload {
  trip_id: string;
  name: string;
  base_version: number;
  client_request_id: string;
  client_created_at: string;
}

interface UpdateMemberDisplayNamePayload {
  member_id: string;
  display_name: string;
  base_version: number;
  client_request_id: string;
  client_created_at: string;
}

interface UpdateUserDisplayNamePayload {
  display_name: string;
  base_version: number;
  client_request_id: string;
}

interface CloseTripPayload {
  trip_id: string;
  base_version: number;
  client_request_id: string;
  client_created_at: string;
}

interface ReopenTripPayload {
  trip_id: string;
  base_version: number;
  client_request_id: string;
  client_created_at: string;
}

interface UpdateUserSettingsPayload {
  settings: Record<string, unknown>;
  base_updated_at: string;
  client_request_id: string;
}

interface MarkNotificationReadPayload {
  notification_ids: string[];
  client_request_id: string;
}

interface PinTripPayload {
  trip_id: string;
  client_request_id: string;
}

interface UnpinTripPayload {
  trip_id: string;
  client_request_id: string;
}

interface ReorderPinnedTripsPayload {
  trip_ids: [string, string];
  client_request_id: string;
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Apply 1 queue item lên server. Trả về raw response từ Supabase
 * (caller dùng để update local mirror với server-confirmed data).
 *
 * Throw nếu fail — caller (PushWorker) classify qua syncQueue.handleError.
 */
export async function dispatch(
  opType: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  switch (opType as OpType) {
    case OP_TYPES.CREATE_GROUP: {
      const p = payload as unknown as CreateGroupPayload;
      const { data, error } = await supabase.rpc('create_group', {
        p_id: p.id,
        p_name: p.name,
        p_admin_member_id: p.admin_member_id,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) {
        // 23505 (duplicate) → idempotency conflict, đã apply trước đó
        if ((error as { code?: string }).code === '23505') return null;
        throw error;
      }
      return data;
    }

    case OP_TYPES.CREATE_EXPENSE: {
      const p = payload as unknown as CreateExpensePayload;
      const { data, error } = await supabase.rpc('create_expense', {
        p_id: p.id,
        p_trip_id: p.trip_id,
        p_group_id: p.group_id,
        p_title: p.title,
        p_amount: p.amount,
        p_category: p.category,
        p_paid_by: p.paid_by,
        p_split_type: p.split_type,
        p_splits: p.splits,
        p_note: p.note,
        p_date: p.date,
        p_image_url: p.image_url,
        p_initial_title: p.initial_title,
        p_actor_name: p.actor_name,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.CREATE_TRIP: {
      const p = payload as unknown as CreateTripPayload;
      const { data, error } = await supabase.rpc('create_trip', {
        p_id: p.id,
        p_group_id: p.group_id,
        p_name: p.name,
        p_type: p.type,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.CREATE_PAYMENT: {
      const p = payload as unknown as CreatePaymentPayload;
      const { data, error } = await supabase.rpc('create_payment', {
        p_id: p.id,
        p_trip_id: p.trip_id,
        p_group_id: p.group_id,
        p_from_member_id: p.from_member_id,
        p_to_member_id: p.to_member_id,
        p_amount: p.amount,
        p_note: p.note,
        p_date: p.date,
        p_client_request_id: p.client_request_id,
        p_title_for_payer: p.title_for_payer,
        p_title_for_receiver: p.title_for_receiver,
        p_actor_name: p.actor_name,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.CREATE_PRESET: {
      const p = payload as unknown as CreatePresetPayload;
      const { data, error } = await supabase
        .from('expense_presets')
        .insert({
          id: p.id,
          user_id: p.user_id,
          title: p.title,
          amount: p.amount,
          category: p.category,
          trip_id: p.trip_id,
          paid_by_member_id: p.paid_by_member_id,
          split_type: p.split_type,
          splits_data: p.splits_data,
          client_request_id: p.client_request_id,
        })
        .select()
        .maybeSingle();
      if (error) {
        if ((error as { code?: string }).code === '23505') return null;
        throw error;
      }
      return data;
    }

    case OP_TYPES.UPDATE_PRESET: {
      const p = payload as unknown as UpdatePresetPayload;
      const { data, error } = await supabase.rpc('update_preset', {
        p_preset_id: p.preset_id,
        p_title: p.title,
        p_amount: p.amount,
        p_category: p.category,
        p_trip_id: p.trip_id,
        p_paid_by_member_id: p.paid_by_member_id,
        p_split_type: p.split_type,
        p_splits_data: p.splits_data,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.DELETE_PRESET: {
      const p = payload as unknown as DeletePresetPayload;
      const userId = await (await import('../services/auth.helper')).getAuthUserId();
      if (!userId) throw new Error('unauthenticated');
      const { data, error } = await supabase
        .from('expense_presets')
        .update({ deleted_at: p.client_created_at })
        .eq('id', p.preset_id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    case OP_TYPES.ADD_VIRTUAL_MEMBER: {
      const p = payload as unknown as AddVirtualMemberPayload;
      const { data, error } = await supabase.rpc('add_virtual_member', {
        p_id: p.id,
        p_group_id: p.group_id,
        p_display_name: p.display_name,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.CLEAR_TRIP: {
      const p = payload as unknown as ClearTripPayload;
      const { data, error } = await supabase
        .rpc('clear_trip', { p_trip_id: p.trip_id })
        .maybeSingle();
      if (error) {
        // RPC trả P0002 nếu trip không tồn tại — chấp nhận coi như done
        if ((error as { code?: string }).code === 'P0002') return null;
        throw error;
      }
      return data;
    }

    case OP_TYPES.DELETE_TRIP: {
      const p = payload as unknown as DeleteTripPayload;
      const { data, error } = await supabase
        .rpc('delete_trip', { p_trip_id: p.trip_id })
        .maybeSingle();
      if (error) {
        if ((error as { code?: string }).code === 'P0002') return null;
        throw error;
      }
      return data;
    }

    case OP_TYPES.REMOVE_MEMBER: {
      const p = payload as unknown as RemoveMemberPayload;
      const { data, error } = await supabase.rpc('remove_member', {
        p_member_id: p.member_id,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.DELETE_GROUP: {
      const p = payload as unknown as DeleteGroupPayload;
      const { data, error } = await supabase
        .from('groups')
        .update({ deleted_at: p.client_created_at })
        .eq('id', p.group_id)
        .is('deleted_at', null)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    case OP_TYPES.DELETE_NOTIFICATION: {
      const p = payload as unknown as DeleteNotificationPayload;
      const userId = await (await import('../services/auth.helper')).getAuthUserId();
      if (!userId) throw new Error('unauthenticated');
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', p.notification_id)
        .eq('user_id', userId);
      if (error) throw error;
      return null;
    }

    case OP_TYPES.DELETE_EXPENSE: {
      const p = payload as unknown as DeleteExpensePayload;
      const { data, error } = await supabase.rpc('delete_expense', {
        p_expense_id: p.expense_id,
        p_actor_name: p.actor_name,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.DELETE_PAYMENT: {
      const p = payload as unknown as DeletePaymentPayload;
      const { data, error } = await supabase.rpc('delete_payment', {
        p_payment_id: p.payment_id,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.UPDATE_GROUP: {
      const p = payload as unknown as UpdateGroupPayload;
      const { data, error } = await supabase.rpc('update_group', {
        p_group_id: p.group_id,
        p_name: p.name,
        p_avatar_url: p.avatar_url,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.UPDATE_TRIP_NAME: {
      const p = payload as unknown as UpdateTripNamePayload;
      const { data, error } = await supabase.rpc('update_trip_name', {
        p_trip_id: p.trip_id,
        p_name: p.name,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.UPDATE_MEMBER_DISPLAY_NAME: {
      const p = payload as unknown as UpdateMemberDisplayNamePayload;
      const { data, error } = await supabase.rpc('update_member_display_name', {
        p_member_id: p.member_id,
        p_display_name: p.display_name,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.UPDATE_USER_DISPLAY_NAME: {
      const p = payload as unknown as UpdateUserDisplayNamePayload;
      const { data, error } = await supabase.rpc('update_user_display_name', {
        p_display_name: p.display_name,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.CLOSE_TRIP: {
      const p = payload as unknown as CloseTripPayload;
      const { data, error } = await supabase.rpc('close_trip', {
        p_trip_id: p.trip_id,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.REOPEN_TRIP: {
      const p = payload as unknown as ReopenTripPayload;
      const { data, error } = await supabase.rpc('reopen_trip', {
        p_trip_id: p.trip_id,
        p_base_version: p.base_version,
        p_client_request_id: p.client_request_id,
        p_client_created_at: p.client_created_at,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.UPDATE_USER_SETTINGS: {
      const p = payload as unknown as UpdateUserSettingsPayload;
      const { data, error } = await supabase.rpc('update_user_settings', {
        p_settings: p.settings,
        p_base_updated_at: p.base_updated_at,
        p_client_request_id: p.client_request_id,
      });
      if (error) throw error;
      return data;
    }

    case OP_TYPES.MARK_NOTIFICATION_READ: {
      const p = payload as unknown as MarkNotificationReadPayload;
      const { data, error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', p.notification_ids)
        .is('read_at', null)
        .select();
      if (error) throw error;
      return data;
    }

    case OP_TYPES.PIN_TRIP: {
      const p = payload as unknown as PinTripPayload;
      const { error } = await supabase.rpc('pin_trip', {
        p_trip_id: p.trip_id,
      });
      if (error) throw error;
      return null;
    }

    case OP_TYPES.UNPIN_TRIP: {
      const p = payload as unknown as UnpinTripPayload;
      const { error } = await supabase.rpc('unpin_trip', {
        p_trip_id: p.trip_id,
      });
      if (error) throw error;
      return null;
    }

    case OP_TYPES.REORDER_PINNED_TRIPS: {
      const p = payload as unknown as ReorderPinnedTripsPayload;
      const { error } = await supabase.rpc('reorder_pinned_trips', {
        p_trip_ids: p.trip_ids,
      });
      if (error) throw error;
      return null;
    }

    default:
      throw new Error(`[pushDispatcher] Unknown op_type: ${opType}`);
  }
}

/**
 * Fetch server state cho entity sau khi conflict detect — UI cần để show modal.
 */
export async function fetchServerEntity(
  entityType: string,
  entityId: string
): Promise<Record<string, unknown> | null> {
  const tableMap: Record<string, string> = {
    group: 'groups',
    trip: 'trips',
    expense: 'expenses',
    payment: 'payments',
    preset: 'expense_presets',
    group_member: 'group_members',
    user: 'users',
    pinned_trip: 'pinned_trips',
    notification: 'notifications',
  };
  const table = tableMap[entityType];
  if (!table) return null;
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', entityId)
    .maybeSingle();
  if (error) return null;
  return data as Record<string, unknown> | null;
}
