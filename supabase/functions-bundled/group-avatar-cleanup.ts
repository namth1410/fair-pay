// =============================================================================
// group-avatar-cleanup — bundled standalone for Supabase Dashboard upload
// =============================================================================
// Source of truth: supabase/functions/group-avatar-cleanup/index.ts
// Schedule via pg_cron weekly (xem header file source).
// =============================================================================
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? '';
const PUBLIC_BASE_URL = (Deno.env.get('R2_PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET || !PUBLIC_BASE_URL) {
  throw new Error('Missing R2 secrets');
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL / SERVICE_ROLE');
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
function extractFileKey(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const prefix = `${PUBLIC_BASE_URL}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
}
async function deleteObject(fileKey: string): Promise<void> {
  const res = await aws.fetch(objectUrl(fileKey), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE failed: ${res.status} ${res.statusText}`);
  }
}

async function listAllKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | null = null;
  for (let page = 0; page < 50; page++) {
    const url = new URL(`${ENDPOINT}/${BUCKET}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (continuationToken) url.searchParams.set('continuation-token', continuationToken);
    const res = await aws.fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`R2 LIST failed: ${res.status} ${res.statusText}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
    const truncatedMatch = xml.match(/<IsTruncated>([^<]+)<\/IsTruncated>/);
    if (truncatedMatch?.[1] !== 'true') break;
    const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = tokenMatch?.[1] ?? null;
    if (!continuationToken) break;
  }
  return keys;
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const r2Keys = await listAllKeys('groups/');

    const { data: groupRows, error: groupErr } = await supabaseAdmin
      .from('groups').select('avatar_url').not('avatar_url', 'is', null);
    if (groupErr) throw groupErr;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentRows, error: recentErr } = await supabaseAdmin
      .from('group_avatar_uploads').select('file_key').gt('created_at', oneDayAgo);
    if (recentErr) throw recentErr;

    const referenced = new Set<string>();
    for (const row of groupRows ?? []) {
      const k = extractFileKey(row.avatar_url);
      if (k) referenced.add(k);
    }
    for (const row of recentRows ?? []) {
      if (row.file_key) referenced.add(row.file_key);
    }

    const orphans = r2Keys.filter((k) => !referenced.has(k));
    let deleted = 0, failed = 0;
    for (const key of orphans) {
      try { await deleteObject(key); deleted++; }
      catch (e) { console.warn('cleanup delete failed:', key, e); failed++; }
    }

    return jsonResponse({
      total_r2: r2Keys.length,
      referenced: referenced.size,
      orphans: orphans.length,
      deleted, failed,
    });
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status);
    console.error('Unhandled error:', err);
    return jsonResponse({ error: 'Lỗi máy chủ' }, 500);
  }
});
