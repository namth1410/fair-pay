// User repository — read user identity + settings từ SQLite local.

import type { UserRow } from '../types/database.types';
import { getDatabase, safeJsonParse, upsertRow } from './_shared';

export interface UserSettings {
  dark_mode?: 'system' | 'light' | 'dark';
  notify_activity?: boolean;
  notify_payment?: boolean;
  notify_member?: boolean;
  notify_smart?: boolean;
  haptics_enabled?: boolean;
  animations_enabled?: boolean;
  push_enabled?: boolean;
}

export interface User {
  id: string;
  authId: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  fcmToken: string | null;
  settings: UserSettings;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    authId: row.auth_id,
    displayName: row.display_name,
    email: row.email,
    photoUrl: row.photo_url,
    fcmToken: row.fcm_token,
    settings: safeJsonParse<UserSettings>(row.settings, {}),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getById(id: string): Promise<User | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<UserRow>(
    'SELECT * FROM users WHERE id = ?',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function getByAuthId(authId: string): Promise<User | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<UserRow>(
    'SELECT * FROM users WHERE auth_id = ?',
    [authId]
  );
  return row ? mapRow(row) : null;
}

export async function getMany(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<UserRow>(
    `SELECT * FROM users WHERE id IN (${placeholders})`,
    ids
  );
  return rows.map(mapRow);
}

/**
 * Pull từ server → upsert vào local. Sync engine gọi.
 * Settings field là jsonb ở Postgres, parse + re-stringify cho SQLite TEXT.
 */
export async function upsertFromServer(row: UserRow): Promise<void> {
  await upsertRow('users', {
    id: row.id,
    auth_id: row.auth_id,
    display_name: row.display_name,
    email: row.email,
    photo_url: row.photo_url,
    fcm_token: row.fcm_token,
    settings: row.settings, // already JSON string
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}
