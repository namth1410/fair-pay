import type { SQLiteDatabase } from 'expo-sqlite';

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

// Future migrations go here
const migrations: Migration[] = [];

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
