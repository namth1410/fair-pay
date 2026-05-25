// Cached auth identity cho offline bootstrap.
// Single-row enforced (CHECK id = 1).

import { getDatabase } from '../db/database';
import type { AuthCacheRow } from '../types/database.types';

function now(): string {
  return new Date().toISOString();
}

export interface CachedIdentity {
  authUserId: string;
  appUserId: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  cachedAt: string;
}

export async function load(): Promise<CachedIdentity | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<AuthCacheRow>(
    'SELECT * FROM _auth_cache WHERE id = 1'
  );
  if (!row) return null;
  return {
    authUserId: row.auth_user_id,
    appUserId: row.app_user_id,
    email: row.email,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    cachedAt: row.cached_at,
  };
}

export async function save(input: {
  authUserId: string;
  appUserId: string;
  email: string;
  displayName?: string | null;
  photoUrl?: string | null;
}): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO _auth_cache (id, auth_user_id, app_user_id, email, display_name, photo_url, cached_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE
       SET auth_user_id = excluded.auth_user_id,
           app_user_id = excluded.app_user_id,
           email = excluded.email,
           display_name = excluded.display_name,
           photo_url = excluded.photo_url,
           cached_at = excluded.cached_at`,
    [
      input.authUserId,
      input.appUserId,
      input.email,
      input.displayName ?? null,
      input.photoUrl ?? null,
      now(),
    ]
  );
}

export async function clear(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM _auth_cache');
}
