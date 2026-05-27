export const SCHEMA_VERSION = 5;

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    auth_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    photo_url TEXT,
    fcm_token TEXT,
    settings TEXT DEFAULT '{"dark_mode":"system","notify_activity":true,"notify_payment":true,"notify_member":true,"notify_smart":true,"haptics_enabled":true,"animations_enabled":true,"push_enabled":true}',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_by TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    client_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    user_id TEXT,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
    is_virtual INTEGER DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    client_request_id TEXT,
    joined_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    left_at TEXT,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(group_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('travel','meal','event','other')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    client_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT,
    deleted_at TEXT,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN ('food','transport','accommodation','fun','shopping','other')),
    paid_by TEXT NOT NULL,
    split_type TEXT NOT NULL CHECK (split_type IN ('equal','ratio','custom')),
    date TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT,
    image_url TEXT,
    created_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    client_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS expense_splits (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES group_members(id)
  )`,

  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    from_member_id TEXT NOT NULL,
    to_member_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT,
    recorded_by TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1,
    client_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (from_member_id) REFERENCES group_members(id),
    FOREIGN KEY (to_member_id) REFERENCES group_members(id),
    FOREIGN KEY (recorded_by) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    trip_id TEXT,
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    before_data TEXT,
    after_data TEXT,
    client_created_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    from_member_id TEXT NOT NULL,
    to_member_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    generated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (from_member_id) REFERENCES group_members(id),
    FOREIGN KEY (to_member_id) REFERENCES group_members(id)
  )`,

  `CREATE TABLE IF NOT EXISTS expense_presets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    trip_id TEXT,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN ('food','transport','accommodation','fun','shopping','other')),
    paid_by_member_id TEXT,
    split_type TEXT CHECK (split_type IN ('equal','ratio','custom')),
    splits_data TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    client_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  )`,

  `CREATE TRIGGER IF NOT EXISTS trg_expense_presets_updated_at
   AFTER UPDATE ON expense_presets
   FOR EACH ROW
   BEGIN
     UPDATE expense_presets SET updated_at = datetime('now') WHERE id = OLD.id;
   END`,

  `CREATE TABLE IF NOT EXISTS pinned_trips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    pinned_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, trip_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    group_id TEXT,
    trip_id TEXT,
    type TEXT NOT NULL,
    actor_id TEXT,
    title TEXT NOT NULL,
    body TEXT,
    data TEXT,
    read_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  // Mirror Postgres schema (migration 20260514150000_group_invitations.sql):
  // invited_email, invited_user_id, invited_by, status ENUM (pending/accepted/declined/revoked), responded_at.
  `CREATE TABLE IF NOT EXISTS group_invitations (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    invited_email TEXT NOT NULL,
    invited_user_id TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    responded_at TEXT,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (invited_user_id) REFERENCES users(id),
    FOREIGN KEY (invited_by) REFERENCES users(id)
  )`,

  // Sync infrastructure: queue mutations chờ push lên server.
  // Mỗi row = 1 lệnh, status flow: pending → in_flight → done | conflict | dead | failed (retry).
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    client_request_id TEXT UNIQUE NOT NULL,
    op_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_flight','done','conflict','dead','failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_error_code TEXT,
    conflict_server_data TEXT,
    next_retry_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // Watermark cho delta pull theo từng bảng.
  `CREATE TABLE IF NOT EXISTS _sync_state (
    table_name TEXT PRIMARY KEY,
    last_pulled_at TEXT,
    last_full_pull_at TEXT
  )`,

  // Pending image uploads cho expense tạo offline.
  `CREATE TABLE IF NOT EXISTS pending_image_uploads (
    expense_id TEXT PRIMARY KEY,
    local_path TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
  )`,

  // Pending group avatar uploads (offline-first cho avatar nhóm).
  // op='upload': local_path trỏ tới file đã stage; worker upload R2 + commit.
  // op='remove': local_path NULL; worker gọi removeGroupAvatar Edge Function.
  // KHÔNG dùng FK vì foreign_keys=OFF ở local DB.
  `CREATE TABLE IF NOT EXISTS pending_group_avatar_uploads (
    group_id TEXT PRIMARY KEY,
    op TEXT NOT NULL DEFAULT 'upload' CHECK (op IN ('upload','remove')),
    local_path TEXT,
    size_bytes INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TEXT,
    created_at TEXT NOT NULL
  )`,

  // Cached auth identity cho offline bootstrap (1 row duy nhất).
  `CREATE TABLE IF NOT EXISTS _auth_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auth_user_id TEXT NOT NULL,
    app_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    photo_url TEXT,
    cached_at TEXT NOT NULL
  )`,

  // Schema version tracking
  `CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY
  )`,

  // Persistent log cho sync errors mà bị nuốt im (vd pullAll safe() catch).
  // ID tự tăng → list theo created_at DESC để debug recent failures. Caller
  // dùng API ở `src/sync/syncErrors.ts` — KHÔNG INSERT trực tiếp.
  `CREATE TABLE IF NOT EXISTS _sync_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_trips_group ON trips(group_id) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_payments_trip ON payments(trip_id) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_group ON audit_logs(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_groups_invite ON groups(invite_code) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_expense_splits_member ON expense_splits(member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expense_presets_user ON expense_presets(user_id) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_expense_presets_trip ON expense_presets(trip_id) WHERE trip_id IS NOT NULL AND deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_pinned_trips_user ON pinned_trips(user_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_group_invitations_invitee ON group_invitations(invited_user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_group_invitations_group ON group_invitations(group_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(next_retry_at) WHERE status = 'failed'`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_errors_created_at ON _sync_errors(created_at DESC)`,

  // Partial unique indexes cho client_request_id — đồng nhất với migration v3
  // (migrations.ts:120-126). UNIQUE chỉ áp khi value non-NULL để cho phép local
  // mirror rows giữ NULL (xem expense.service.ts writeExpenseLocal: cột này
  // không được set ở local INSERT, chỉ chảy qua sync_queue).
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_client_request_id
     ON groups(client_request_id) WHERE client_request_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_client_request_id
     ON group_members(client_request_id) WHERE client_request_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_client_request_id
     ON trips(client_request_id) WHERE client_request_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_client_request_id
     ON expenses(client_request_id) WHERE client_request_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_client_request_id
     ON payments(client_request_id) WHERE client_request_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_presets_client_request_id
     ON expense_presets(client_request_id) WHERE client_request_id IS NOT NULL`,
];
