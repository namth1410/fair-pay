export const SCHEMA_VERSION = 1;

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    auth_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    photo_url TEXT,
    fcm_token TEXT,
    settings TEXT DEFAULT '{"dark_mode":"system","notify_expense":true,"notify_reminder":true}',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_by TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
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
    joined_at TEXT DEFAULT (datetime('now')),
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
    created_at TEXT DEFAULT (datetime('now')),
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
    created_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
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
    created_at TEXT DEFAULT (datetime('now')),
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
    title TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN ('food','transport','accommodation','fun','shopping','other')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, title),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  // Local-only: sync queue
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','synced','failed')),
    retry_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  )`,

  // Schema version tracking
  `CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY
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
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status) WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS idx_expense_splits_member ON expense_splits(member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id)`,
];
