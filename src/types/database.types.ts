// TypeScript types mirroring PostgreSQL schema
// SQLite differences: UUID → TEXT, Boolean → 0|1, Array → JSON string, Timestamp → ISO string

export interface UserRow {
  id: string;
  auth_id: string;
  display_name: string;
  email: string;
  photo_url: string | null;
  fcm_token: string | null;
  settings: string; // JSON: { dark_mode, notify_expense, notify_reminder }
  created_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  invite_code: string;
  created_at: string;
  deleted_at: string | null;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  role: 'admin' | 'member';
  is_virtual: number; // 0 = false, 1 = true
  joined_at: string;
  left_at: string | null;
}

export interface TripRow {
  id: string;
  group_id: string;
  name: string;
  type: 'travel' | 'meal' | 'event' | 'other';
  status: 'open' | 'closed';
  created_by: string;
  created_at: string;
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
  created_by: string;
  version: number;
  created_at: string;
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
  created_at: string;
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

export interface SyncQueueRow {
  id: number;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string;
  status: 'pending' | 'synced' | 'failed';
  retry_count: number;
  created_at: string;
  synced_at: string | null;
}
