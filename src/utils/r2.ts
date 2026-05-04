import { R2_PUBLIC_BASE_URL } from '../config/constants';

/**
 * Extract the file_key portion from a public R2 URL produced by the
 * Edge Function. Returns null when the URL doesn't belong to our bucket
 * (defensive — avoid passing arbitrary keys to the delete endpoint).
 */
export function extractFileKey(publicUrl: string | null | undefined): string | null {
  if (!publicUrl || !R2_PUBLIC_BASE_URL) return null;
  const base = R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  const prefix = `${base}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
}
