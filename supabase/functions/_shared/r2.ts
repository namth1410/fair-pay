// R2 helper — Sigv4 presigned URLs + object operations.
// R2 dùng S3-compatible API (region 'auto').
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? '';
const PUBLIC_BASE_URL = (Deno.env.get('R2_PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET || !PUBLIC_BASE_URL) {
  throw new Error('Missing R2 secrets — set via `supabase secrets set R2_*`');
}

const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const aws = new AwsClient({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  region: 'auto',
  service: 's3',
});

function objectUrl(fileKey: string): string {
  return `${ENDPOINT}/${BUCKET}/${encodeURI(fileKey)}`;
}

export function getPublicUrl(fileKey: string): string {
  return `${PUBLIC_BASE_URL}/${fileKey}`;
}

/**
 * Sign a PUT URL with Content-Length pinned via signed header — R2 enforces
 * the exact byte count, so client can't bypass our size check.
 */
export async function presignPutUrl(
  fileKey: string,
  contentLength: number,
  contentType: string,
  ttlSeconds = 60
): Promise<string> {
  const url = new URL(objectUrl(fileKey));
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds));

  const signed = await aws.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: {
        'content-length': String(contentLength),
        'content-type': contentType,
      },
    }),
    { aws: { signQuery: true, allHeaders: true } }
  );
  return signed.url;
}

export async function headObject(
  fileKey: string
): Promise<{ exists: boolean; size: number; contentType: string }> {
  const res = await aws.fetch(objectUrl(fileKey), { method: 'HEAD' });
  if (res.status === 404) {
    return { exists: false, size: 0, contentType: '' };
  }
  if (!res.ok) {
    throw new Error(`R2 HEAD failed: ${res.status} ${res.statusText}`);
  }
  return {
    exists: true,
    size: Number(res.headers.get('content-length') ?? '0'),
    contentType: res.headers.get('content-type') ?? '',
  };
}

export async function deleteObject(fileKey: string): Promise<void> {
  const res = await aws.fetch(objectUrl(fileKey), { method: 'DELETE' });
  // R2 returns 204 success or 404 if already gone — both acceptable.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Extract the file_key portion from a public URL produced by getPublicUrl().
 * Returns null if the URL doesn't belong to our bucket — defends against
 * deleting an unrelated object if the DB ever holds an external avatar URL.
 */
export function extractFileKey(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const prefix = `${PUBLIC_BASE_URL}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
}
