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
      // 1. Add column nếu chưa có. ALTER TABLE ADD COLUMN với DEFAULT
      //    function trong SQLite không hợp lệ → set NULL rồi backfill bên dưới.
      const cols = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info('expense_presets')"
      );
      const hasUpdatedAt = cols.some((c) => c.name === 'updated_at');
      if (!hasUpdatedAt) {
        await db.execAsync(
          `ALTER TABLE expense_presets ADD COLUMN updated_at TEXT`
        );
        // Backfill = created_at để sort hoạt động ngay sau migrate.
        await db.execAsync(
          `UPDATE expense_presets SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL`
        );
      }

      // 2. Trigger
      await db.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_expense_presets_updated_at
         AFTER UPDATE ON expense_presets
         FOR EACH ROW
         BEGIN
           UPDATE expense_presets SET updated_at = datetime('now') WHERE id = OLD.id;
         END`
      );

      // 3. Migrate users.settings — chỉ touch row có key legacy.
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
          // settings không parse được → reset về default
          await db.runAsync(
            'UPDATE users SET settings = ? WHERE id = ?',
            '{"dark_mode":"system","notify_activity":true,"notify_payment":true,"notify_member":true,"notify_smart":true,"haptics_enabled":true,"animations_enabled":true}',
            u.id
          );
        }
      }
    },
  },
];

export async function runMigrations(
  db: SQLiteDatabase,
  currentVersion: number
): Promise<void> {
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const migration of pending) {
    await migration.up(db);
    await db.runAsync(
      'INSERT INTO _schema_version (version) VALUES (?)',
      migration.version
    );
    console.log(`[DB] Migrated to v${migration.version}`);
  }
}
