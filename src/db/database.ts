import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema';
import { DB_NAME } from '../config/constants';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync(DB_NAME);

  // Enable WAL mode for better concurrent read performance
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

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
  }

  console.log(`[DB] Initialized — schema v${SCHEMA_VERSION}`);
  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
