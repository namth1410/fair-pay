// Sync types — shared giữa syncQueue, syncEngine, repositories.

import type { SyncQueueRow, SyncQueueStatus } from '../types/database.types';
import { isNetworkError } from '../utils/network';

export type { SyncQueueStatus } from '../types/database.types';

/**
 * Tên RPC sẽ được gọi khi replay queue item.
 * KHÔNG hardcode chuỗi rời rạc — luôn import từ đây.
 */
export const OP_TYPES = {
  // Create (P1: append-only)
  CREATE_GROUP: 'create_group',
  CREATE_TRIP: 'create_trip',
  CREATE_EXPENSE: 'create_expense',
  CREATE_PAYMENT: 'create_payment',
  CREATE_PRESET: 'create_preset',
  ADD_VIRTUAL_MEMBER: 'add_virtual_member',

  // Soft-delete (P2: idempotent)
  DELETE_GROUP: 'delete_group',
  DELETE_TRIP: 'delete_trip',
  CLEAR_TRIP: 'clear_trip',
  DELETE_EXPENSE: 'delete_expense',
  DELETE_PAYMENT: 'delete_payment',
  DELETE_PRESET: 'delete_preset',
  DELETE_NOTIFICATION: 'delete_notification',
  REMOVE_MEMBER: 'remove_member',

  // State edit với version (P3)
  UPDATE_GROUP: 'update_group',
  UPDATE_TRIP_NAME: 'update_trip_name',
  UPDATE_MEMBER_DISPLAY_NAME: 'update_member_display_name',
  UPDATE_USER_DISPLAY_NAME: 'update_user_display_name',
  UPDATE_PRESET: 'update_preset',
  UPDATE_EXPENSE: 'update_expense',

  // State machine với version (P4)
  CLOSE_TRIP: 'close_trip',
  REOPEN_TRIP: 'reopen_trip',

  // LWW jsonb (P5)
  UPDATE_USER_SETTINGS: 'update_user_settings',

  // List operations (P6/P7)
  PIN_TRIP: 'pin_trip',
  UNPIN_TRIP: 'unpin_trip',
  REORDER_PINNED_TRIPS: 'reorder_pinned_trips',

  // Idempotent toggles (P7)
  MARK_NOTIFICATION_READ: 'mark_notification_read',
  MARK_ALL_NOTIFICATIONS_READ: 'mark_all_notifications_read',
} as const;

export type OpType = (typeof OP_TYPES)[keyof typeof OP_TYPES];

/**
 * Loại entity cho mỗi mutation. Dùng để index sync_queue lookup
 * "có pending mutation cho row X không?".
 */
export const ENTITY_TYPES = {
  GROUP: 'group',
  TRIP: 'trip',
  EXPENSE: 'expense',
  PAYMENT: 'payment',
  PRESET: 'preset',
  GROUP_MEMBER: 'group_member',
  USER: 'user',
  PINNED_TRIP: 'pinned_trip',
  NOTIFICATION: 'notification',
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

/**
 * Payload cho mỗi loại operation. Schema strict để giảm bug serialize/parse.
 * `base_version` là version TRƯỚC khi user edit offline — server-side check
 * để detect conflict. `client_created_at` cho audit log chronological order.
 */
export interface QueuePayloadBase {
  client_created_at: string; // ISO timestamp khi user thực sự gây ra mutation
}

// Pattern P1: Create
export type CreateGroupPayload = QueuePayloadBase & {
  id: string;
  name: string;
  admin_member_id: string;
  client_request_id: string;
};

export type CreateExpensePayload = QueuePayloadBase & {
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
  image_url: string | null; // null cho deferred upload
  splits: Array<{ member_id: string; amount: number }>;
  // Notification args (capture client-side để RPC fan-out atomic khi replay offline)
  initial_title: string;
  actor_name: string;
};

export type CreatePaymentPayload = QueuePayloadBase & {
  id: string;
  trip_id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  note: string | null;
  date: string;
  client_request_id: string;
  // Notification args — payment có 2 type khác nhau cho payer vs receiver
  title_for_payer: string;
  title_for_receiver: string;
  actor_name: string;
};

// Pattern P3: Update với version
export type UpdateGroupPayload = QueuePayloadBase & {
  group_id: string;
  name: string | null;
  avatar_url: string | null;
  base_version: number;
};

export type UpdateTripNamePayload = QueuePayloadBase & {
  trip_id: string;
  name: string;
  base_version: number;
};

// (Các payload type khác sẽ thêm khi implement từng repo)

// Util: parse JSON payload từ SyncQueueRow.payload với fallback an toàn
export function parsePayload<T>(row: SyncQueueRow): T | null {
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

/**
 * Phân loại error code → queue status sau khi push thất bại.
 *
 * - P0410 → conflict (show modal)
 * - 23503 (FK violation), 42501 (permission denied), P0002 (not found) → dead
 *   (data đã biến mất hoặc user mất quyền — không thể replay)
 * - 23505 (unique violation) trên client_request_id → done (đã apply trước đó)
 * - Network/5xx/timeout → failed (retry với backoff)
 */
export function classifyError(
  code: string | null,
  message: string | null
): SyncQueueStatus {
  if (code === 'P0410') return 'conflict';
  if (code === '23505') return 'done'; // duplicate idempotency → đã apply
  if (code === '23503' || code === '42501' || code === 'P0002') return 'dead';
  if (code === 'P0429') return 'failed'; // rate limit — retry fixed-backoff, KHÔNG dead-letter (xem markFailed)

  // Lỗi mạng — kiểm tra qua helper chung (msg + code + AbortError)
  if (isNetworkError({ message })) {
    return 'failed';
  }

  // Unknown → failed để retry (safe default; nếu retry mãi vẫn fail, max_retry sẽ chuyển sang dead)
  return 'failed';
}

// Max retry count trước khi chuyển sang dead
export const MAX_QUEUE_RETRIES = 5;

// Rate limit (P0429): retry với fixed backoff dài để batch offline hợp lệ tự lành khi
// cửa sổ trượt trôi qua; KHÔNG tăng retry_count / KHÔNG dead-letter (xem markFailed).
export const RATE_LIMIT_BACKOFF_SECONDS = 30 * 60; // 30 phút
