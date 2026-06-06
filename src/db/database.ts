import * as SQLite from 'expo-sqlite';

import { DB_NAME } from '../config/constants';
import { runMigrations } from './migrations';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Fast path: chỉ skip toàn bộ init nếu db ĐÃ open VÀ schema_version đã match.
  // Trước đây `if (db) return db` early-return khiến migration bị skip khi Fast
  // Refresh trong dev mode giữ module scope sống (db !== null) còn SCHEMA_VERSION
  // ở schema.ts đã bump — DB không bao giờ upgrade tới khi cold start.
  if (db) {
    try {
      const v = await db.getFirstAsync<{ version: number }>(
        'SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1'
      );
      if (v?.version === SCHEMA_VERSION) return db;
    } catch {
      // _schema_version chưa tồn tại → fall through để init đầy đủ
    }
  }

  db = await SQLite.openDatabaseAsync(DB_NAME);

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');
  // Foreign keys intentionally OFF: local mirror là cache, server (Postgres
  // qua RPC) là source of truth enforce FK. Local-first writes (offline
  // queue + cold-start race) có thể tham chiếu trip/group/member chưa kịp
  // pull về local — FK enforcement sẽ block write hợp lệ. Cascade ON DELETE
  // không cần ở local vì xóa entity là soft-delete (deleted_at).
  await db.execAsync('PRAGMA foreign_keys = OFF;');

  // Create all tables and indexes
  for (const sql of CREATE_TABLES) {
    await db.execAsync(sql);
  }

  // Track schema version
  const versionResult = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1'
  );

  if (!versionResult) {
    await db.runAsync(
      'INSERT INTO _schema_version (version) VALUES (?)',
      SCHEMA_VERSION
    );
  } else {
    // Run any pending migrations for existing installs
    await runMigrations(db, versionResult.version);
  }

  if (__DEV__) console.log(`[DB] Initialized — schema v${SCHEMA_VERSION}`);
  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
