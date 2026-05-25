// TypeScript types mirroring PostgreSQL schema
// SQLite differences: UUID → TEXT, Boolean → 0|1, Array → JSON string, Timestamp → ISO string

export interface UserRow {
  id: string;
  auth_id: string;
  display_name: string;
  email: string;
  photo_url: string | null;
  fcm_token: string | null;
  settings: string; // JSON: UserSettings — see services/user.service.ts
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  invite_code: string;
  version: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  role: 'admin' | 'member';
  is_virtual: number; // 0 = false, 1 = true
  version: number;
  client_request_id: string | null;
  joined_at: string;
  updated_at: string;
  left_at: string | null;
}

export interface TripRow {
  id: string;
  group_id: string;
  name: string;
  type: 'travel' | 'meal' | 'event' | 'other';
  status: 'open' | 'closed';
  created_by: string;
  version: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  deleted_at: string | null;
}

export interface ExpenseRow {
  id: string;
  trip_id: string;
  group_id: string;
  title: string;
  amount: number;
  category: 'food' | 'transport' | 'accommodation' | 'fun' | 'shopping' | 'other';
  paid_by: string; // group_member id (single)
  split_type: 'equal' | 'ratio' | 'custom';
  date: string;
  note: string | null;
  image_url: string | null;
  created_by: string;
  version: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ExpenseSplitRow {
  id: string;
  expense_id: string;
  member_id: string;
  amount: number;
}

export interface PaymentRow {
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

export interface AuditLogRow {
  id: string;
  group_id: string;
  trip_id: string | null;
  action: string;
  actor_id: string;
  target_id: string;
  before_data: string | null;
  after_data: string | null;
  client_created_at: string | null;
  created_at: string;
}

export interface SettlementRow {
  id: string;
  trip_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  generated_at: string;
}

export interface ExpensePresetRow {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  category: 'food' | 'transport' | 'accommodation' | 'fun' | 'shopping' | 'other';
  trip_id: string | null;
  paid_by_member_id: string | null;
  split_type: 'equal' | 'ratio' | 'custom' | null;
  splits_data: PresetSplitEntry[] | null;
  version: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PresetSplitEntry {
  member_id: string;
  ratio?: number;
  amount?: number;
}

export interface GroupAvatarUploadRow {
  id: string;
  group_id: string;
  uploaded_by: string;
  file_key: string;
  created_at: string;
}

export interface ExpenseImageUploadRow {
  id: string;
  expense_id: string;
  group_id: string;
  uploaded_by: string;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  user_id: string;
  message: string;
  app_version: string | null;
  platform: string | null;
  created_at: string;
}

export interface NotificationRow {
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
  updated_at: string;
}

export interface PinnedTripRow {
  id: string;
  user_id: string;
  trip_id: string;
  position: number; // 0 = card trái, 1 = card phải
  pinned_at: string;
  updated_at: string;
}

// Server schema dùng `invited_email`, `invited_user_id`, `invited_by`, `responded_at`
// + ENUM `invitation_status` (pending/accepted/declined/revoked).
export interface GroupInvitationRow {
  id: string;
  group_id: string;
  invited_email: string;
  invited_user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_at: string;
  updated_at: string;
  responded_at: string | null;
}

export interface TripWithGroup extends TripRow {
  group_name: string;
}

// ─── Sync infrastructure (local-only, không có ở server) ──────────────────────

export type SyncQueueStatus =
  | 'pending'      // chờ push
  | 'in_flight'   // đang gửi RPC
  | 'done'         // server đã nhận, sẽ delete row
  | 'conflict'    // server reject 409 — chờ user resolve
  | 'dead'         // không thể replay (FK violation, permission denied, group bị xóa…) — bỏ
  | 'failed';     // retry sau (network, 503)

export interface SyncQueueRow {
  id: string;                 // client UUID
  client_request_id: string;  // idempotency key (UNIQUE)
  op_type: string;            // vd 'create_expense', 'update_group_name'
  entity_type: string;        // 'expense' | 'group' | 'trip' | ...
  entity_id: string;          // target entity UUID
  payload: string;            // JSON serialized
  status: SyncQueueStatus;
  retry_count: number;
  last_error: string | null;
  last_error_code: string | null;  // 'P0410' (conflict), '23503' (FK), ...
  conflict_server_data: string | null;  // JSON: server state khi conflict detected
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncStateRow {
  table_name: string;
  last_pulled_at: string | null;
  last_full_pull_at: string | null;
}

export interface PendingImageUploadRow {
  expense_id: string;
  local_path: string;
  retry_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface AuthCacheRow {
  id: number; // always 1 (single row enforced by CHECK)
  auth_user_id: string;
  app_user_id: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  cached_at: string;
}
