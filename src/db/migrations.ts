import type { SQLiteDatabase } from 'expo-sqlite';

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 2,
    // - Thêm `expense_presets.updated_at` (preset.service.ts sort theo cột này).
    // - Tạo trigger refresh updated_at sau mỗi UPDATE.
    // - Cập nhật `users.settings` JSON cho row có key legacy
    //   (`notify_expense`, `notify_reminder` → `notify_activity / notify_payment / notify_member / notify_smart`).
    up: async (db) => {
      const cols = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info('expense_presets')"
      );
      const hasUpdatedAt = cols.some((c) => c.name === 'updated_at');
      if (!hasUpdatedAt) {
        await db.execAsync(
          `ALTER TABLE expense_presets ADD COLUMN updated_at TEXT`
        );
        await db.execAsync(
          `UPDATE expense_presets SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL`
        );
      }

      await db.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_expense_presets_updated_at
         AFTER UPDATE ON expense_presets
         FOR EACH ROW
         BEGIN
           UPDATE expense_presets SET updated_at = datetime('now') WHERE id = OLD.id;
         END`
      );

      const legacyUsers = await db.getAllAsync<{ id: string; settings: string }>(
        `SELECT id, settings FROM users
         WHERE settings LIKE '%notify_expense%' OR settings LIKE '%notify_reminder%'`
      );
      for (const u of legacyUsers) {
        try {
          const parsed = JSON.parse(u.settings || '{}') as Record<string, unknown>;
          const next = {
            dark_mode: parsed.dark_mode ?? 'system',
            notify_activity: parsed.notify_activity ?? parsed.notify_expense ?? true,
            notify_payment: parsed.notify_payment ?? true,
            notify_member: parsed.notify_member ?? parsed.notify_reminder ?? true,
            notify_smart: parsed.notify_smart ?? true,
            haptics_enabled: parsed.haptics_enabled ?? true,
            animations_enabled: parsed.animations_enabled ?? true,
          };
          await db.runAsync(
            'UPDATE users SET settings = ? WHERE id = ?',
            JSON.stringify(next),
            u.id
          );
        } catch {
          await db.runAsync(
            'UPDATE users SET settings = ? WHERE id = ?',
            '{"dark_mode":"system","notify_activity":true,"notify_payment":true,"notify_member":true,"notify_smart":true,"haptics_enabled":true,"animations_enabled":true}',
            u.id
          );
        }
      }
    },
  },
  {
    version: 3,
    // Offline-first foundation:
    // - Thêm `version`, `updated_at`, `client_request_id` cho các bảng mutable.
    // - Refactor `sync_queue` (drop+recreate vì v2 schema khác hoàn toàn, không có data thật).
    // - Tạo bảng mới: _sync_state, pending_image_uploads, _auth_cache,
    //   pinned_trips, notifications, group_invitations.
    // - Thêm cột `audit_logs.client_created_at` cho clock-skew-safe ordering.
    // - Thêm cột `expense_presets.deleted_at` + scope columns (trip_id, paid_by_member_id, split_type, splits_data).
    up: async (db) => {
      const addColumnIfMissing = async (
        table: string,
        column: string,
        ddl: string
      ) => {
        const cols = await db.getAllAsync<{ name: string }>(
          `PRAGMA table_info('${table}')`
        );
        if (!cols.some((c) => c.name === column)) {
          await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
        }
      };

      const mutableTables: Array<{ name: string; pkCol?: string }> = [
        { name: 'users' },
        { name: 'groups' },
        { name: 'group_members' },
        { name: 'trips' },
        { name: 'expenses' },
        { name: 'payments' },
        { name: 'expense_presets' },
      ];

      for (const t of mutableTables) {
        if (t.name !== 'expenses') {
          // expenses đã có `version` từ trước
          await addColumnIfMissing(t.name, 'version', 'version INTEGER NOT NULL DEFAULT 1');
        }
        await addColumnIfMissing(t.name, 'updated_at', 'updated_at TEXT');
        await db.execAsync(
          `UPDATE ${t.name} SET updated_at = COALESCE(updated_at, created_at, joined_at, datetime('now'))
           WHERE updated_at IS NULL`
        );

        if (t.name !== 'users') {
          // users không có client_request_id (chỉ tạo qua auth flow)
          await addColumnIfMissing(
            t.name,
            'client_request_id',
            'client_request_id TEXT'
          );
          // Partial unique index thay vì UNIQUE constraint (ALTER TABLE không add được)
          await db.execAsync(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_${t.name}_client_request_id
             ON ${t.name}(client_request_id)
             WHERE client_request_id IS NOT NULL`
          );
        }
      }

      // expense_presets: thêm scope columns + deleted_at
      await addColumnIfMissing('expense_presets', 'trip_id', 'trip_id TEXT');
      await addColumnIfMissing(
        'expense_presets',
        'paid_by_member_id',
        'paid_by_member_id TEXT'
      );
      await addColumnIfMissing('expense_presets', 'split_type', 'split_type TEXT');
      await addColumnIfMissing('expense_presets', 'splits_data', 'splits_data TEXT');
      await addColumnIfMissing('expense_presets', 'deleted_at', 'deleted_at TEXT');

      // audit_logs: client timestamp
      await addColumnIfMissing(
        'audit_logs',
        'client_created_at',
        'client_created_at TEXT'
      );

      // Refactor sync_queue (drop + recreate — không có data thật ở v2)
      await db.execAsync(`DROP TABLE IF EXISTS sync_queue`);
      await db.execAsync(
        `CREATE TABLE sync_queue (
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
        )`
      );

      // Bảng mới
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS _sync_state (
          table_name TEXT PRIMARY KEY,
          last_pulled_at TEXT,
          last_full_pull_at TEXT
        )`
      );

      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS pending_image_uploads (
          expense_id TEXT PRIMARY KEY,
          local_path TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          next_retry_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
        )`
      );

      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS _auth_cache (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          auth_user_id TEXT NOT NULL,
          app_user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          display_name TEXT,
          photo_url TEXT,
          cached_at TEXT NOT NULL
        )`
      );

      await db.execAsync(
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
        )`
      );

      await db.execAsync(
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
        )`
      );

      await db.execAsync(
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
        )`
      );

      // Indexes mới cho v3
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_expense_presets_user
         ON expense_presets(user_id) WHERE deleted_at IS NULL`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_expense_presets_trip
         ON expense_presets(trip_id) WHERE trip_id IS NOT NULL AND deleted_at IS NULL`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_pinned_trips_user
         ON pinned_trips(user_id, position)`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_notifications_user
         ON notifications(user_id, created_at DESC)`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_notifications_unread
         ON notifications(user_id) WHERE read_at IS NULL`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_group_invitations_invitee
         ON group_invitations(invited_user_id, status)`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_group_invitations_group
         ON group_invitations(group_id, status)`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_sync_queue_status
         ON sync_queue(status, created_at)`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_sync_queue_retry
         ON sync_queue(next_retry_at) WHERE status = 'failed'`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_sync_queue_entity
         ON sync_queue(entity_type, entity_id, status)`
      );
    },
  },
  {
    version: 4,
    // Persistent log cho sync errors bị `safe()` của pullAll nuốt im. Trước đây
    // chỉ console.warn → mất khi user đóng app. Giờ insert vào DB để adb pull
    // về phân tích được nguyên nhân pullGroups/pullUsers/etc fail.
    up: async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS _sync_errors (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           source TEXT NOT NULL,
           error_code TEXT,
           error_message TEXT NOT NULL,
           context TEXT,
           created_at TEXT NOT NULL
         )`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_sync_errors_created_at
         ON _sync_errors(created_at DESC)`
      );
    },
  },
  {
    version: 5,
    // Bảng pending_group_avatar_uploads — defer upload/remove avatar nhóm khi offline.
    // Mirror pattern của pending_image_uploads nhưng có thêm `op` để phân biệt
    // upload vs remove operation.
    up: async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS pending_group_avatar_uploads (
           group_id TEXT PRIMARY KEY,
           op TEXT NOT NULL DEFAULT 'upload' CHECK (op IN ('upload','remove')),
           local_path TEXT,
           size_bytes INTEGER,
           retry_count INTEGER NOT NULL DEFAULT 0,
           last_error TEXT,
           next_retry_at TEXT,
           created_at TEXT NOT NULL
         )`
      );
    },
  },
];

export async function runMigrations(
  db: SQLiteDatabase,
  currentVersion: number
): Promise<void> {
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const migration of pending) {
    // Atomic: up() + bump _schema_version cùng commit/rollback. Fail giữa chừng →
    // toàn bộ DDL rollback → state về version cũ → restart retry an toàn (không
    // dính destructive ops như DROP TABLE chạy nửa vời).
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.runAsync(
        'INSERT INTO _schema_version (version) VALUES (?)',
        migration.version
      );
    });
    console.log(`[DB] Migrated to v${migration.version}`);
  }
}
