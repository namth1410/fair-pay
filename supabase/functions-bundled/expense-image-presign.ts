// =============================================================================
// expense-image-presign — bundled standalone for Supabase Dashboard upload
// =============================================================================
// Source of truth: supabase/functions/expense-image-presign/index.ts
//                  + supabase/functions/_shared/{r2,auth}.ts
// Khi sửa logic, sửa ở source và regenerate file này.
// =============================================================================
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// --- env ---
const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? '';
const PUBLIC_BASE_URL = (Deno.env.get('R2_PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET || !PUBLIC_BASE_URL) {
  throw new Error('Missing R2 secrets — set R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_NAME/PUBLIC_BASE_URL');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
}

// --- R2 client ---
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
function getPublicUrl(fileKey: string): string {
  return `${PUBLIC_BASE_URL}/${fileKey}`;
}
async function presignPutUrl(fileKey: string, contentLength: number, contentType: string, ttlSeconds = 60): Promise<string> {
  const url = new URL(objectUrl(fileKey));
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  const signed = await aws.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: { 'content-length': String(contentLength), 'content-type': contentType },
    }),
    { aws: { signQuery: true, allHeaders: true } }
  );
  return signed.url;
}

// --- Supabase admin client ---
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Auth helpers ---
class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

async function getAppUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Chưa đăng nhập');

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Token không hợp lệ');

  const { data: row, error: rowErr } = await supabaseAdmin
    .from('users').select('id').eq('auth_id', data.user.id).single();
  if (rowErr || !row) throw new HttpError(401, 'User chưa khởi tạo');
  return row.id as string;
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

function withErrorHandling(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return jsonResponse({}, 204);
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) {
        return jsonResponse({ error: err.message, ...err.extra }, err.status);
      }
      console.error('Unhandled error:', err);
      return jsonResponse({ error: 'Lỗi máy chủ' }, 500);
    }
  };
}

// --- Handler ---
const MAX_BYTES = 2 * 1024 * 1024;
const QUOTA_PER_USER_PER_DAY = 100;
const QUOTA_PER_GROUP_PER_DAY = 50;
const CONTENT_TYPE = 'image/jpeg';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomHex(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const expenseId = body?.expenseId;
    const tripId = body?.tripId;
    const sizeBytes = body?.sizeBytes;

    if (typeof expenseId !== 'string' || !UUID_REGEX.test(expenseId)) {
      throw new HttpError(400, 'expenseId không hợp lệ');
    }
    if (typeof tripId !== 'string' || !UUID_REGEX.test(tripId)) {
      throw new HttpError(400, 'tripId không hợp lệ');
    }
    if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new HttpError(400, 'sizeBytes không hợp lệ');
    }
    if (sizeBytes > MAX_BYTES) throw new HttpError(413, 'Ảnh vượt quá 2 MB');

    const userId = await getAppUserId(req);

    const { data: tripRow } = await supabaseAdmin
      .from('trips').select('group_id')
      .eq('id', tripId).is('deleted_at', null).maybeSingle();

    if (!tripRow) throw new HttpError(404, 'Không tìm thấy chuyến đi');
    const groupId = tripRow.group_id as string;

    const { data: memberRow } = await supabaseAdmin
      .from('group_members').select('id')
      .eq('group_id', groupId).eq('user_id', userId).is('left_at', null)
      .maybeSingle();

    if (!memberRow) throw new HttpError(403, 'Bạn không thuộc nhóm này');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: userCount }, { count: groupCount }] = await Promise.all([
      supabaseAdmin.from('expense_image_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId).gt('created_at', oneDayAgo),
      supabaseAdmin.from('expense_image_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId).gt('created_at', oneDayAgo),
    ]);

    if ((userCount ?? 0) >= QUOTA_PER_USER_PER_DAY) {
      throw new HttpError(429, 'Bạn đã upload tối đa 100 ảnh trong ngày', { retryAfter: 24 * 60 * 60 });
    }
    if ((groupCount ?? 0) >= QUOTA_PER_GROUP_PER_DAY) {
      throw new HttpError(429, 'Nhóm đã upload tối đa 50 ảnh khoản chi trong ngày', { retryAfter: 24 * 60 * 60 });
    }

    const fileKey = `expenses/${expenseId}/${Date.now()}-${randomHex(8)}.jpg`;
    const uploadUrl = await presignPutUrl(fileKey, sizeBytes, CONTENT_TYPE, 60);
    const publicUrl = getPublicUrl(fileKey);

    await supabaseAdmin.from('expense_image_uploads').insert({
      expense_id: expenseId,
      group_id: groupId,
      uploaded_by: userId,
      file_key: fileKey,
    });

    return jsonResponse({ uploadUrl, fileKey, publicUrl });
  })
);
