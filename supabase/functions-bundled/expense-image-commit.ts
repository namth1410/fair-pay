// =============================================================================
// expense-image-commit — bundled standalone for Supabase Dashboard upload
// =============================================================================
// Source of truth: supabase/functions/expense-image-commit/index.ts
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
async function headObject(fileKey: string): Promise<{ exists: boolean; size: number; contentType: string }> {
  const res = await aws.fetch(objectUrl(fileKey), { method: 'HEAD' });
  if (res.status === 404) return { exists: false, size: 0, contentType: '' };
  if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status} ${res.statusText}`);
  return {
    exists: true,
    size: Number(res.headers.get('content-length') ?? '0'),
    contentType: res.headers.get('content-type') ?? '',
  };
}
async function deleteObject(fileKey: string): Promise<void> {
  const res = await aws.fetch(objectUrl(fileKey), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE failed: ${res.status} ${res.statusText}`);
  }
}
function extractFileKey(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const prefix = `${PUBLIC_BASE_URL}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const expenseId = body?.expenseId;
    const fileKey = body?.fileKey;

    if (typeof expenseId !== 'string' || !UUID_REGEX.test(expenseId)) {
      throw new HttpError(400, 'expenseId không hợp lệ');
    }
    if (typeof fileKey !== 'string' || !fileKey) {
      throw new HttpError(400, 'Thiếu fileKey');
    }
    if (!fileKey.startsWith(`expenses/${expenseId}/`)) {
      throw new HttpError(403, 'fileKey không thuộc khoản chi này');
    }

    const userId = await getAppUserId(req);

    const { data: expenseRow } = await supabaseAdmin
      .from('expenses').select('group_id, image_url, paid_by, created_by')
      .eq('id', expenseId).is('deleted_at', null).maybeSingle();

    if (!expenseRow) throw new HttpError(404, 'Không tìm thấy khoản chi');

    const { data: memberRow } = await supabaseAdmin
      .from('group_members').select('role')
      .eq('group_id', expenseRow.group_id).eq('user_id', userId).is('left_at', null)
      .maybeSingle();

    if (!memberRow) throw new HttpError(403, 'Bạn không thuộc nhóm này');
    if (memberRow.role !== 'admin' && expenseRow.created_by !== userId) {
      throw new HttpError(403, 'Chỉ admin hoặc người tạo mới được đổi ảnh');
    }

    const head = await headObject(fileKey);
    if (!head.exists) throw new HttpError(400, 'Chưa thấy file upload, thử lại');
    if (head.size > MAX_BYTES) {
      await deleteObject(fileKey).catch(() => {});
      throw new HttpError(413, 'File vượt quá 2 MB');
    }
    if (!head.contentType.startsWith('image/')) {
      await deleteObject(fileKey).catch(() => {});
      throw new HttpError(415, 'Định dạng file không hợp lệ');
    }

    const publicUrl = getPublicUrl(fileKey);
    const oldKey = extractFileKey(expenseRow.image_url ?? null);

    const { error: updErr } = await supabaseAdmin
      .from('expenses').update({ image_url: publicUrl }).eq('id', expenseId);

    if (updErr) {
      await deleteObject(fileKey).catch(() => {});
      throw new HttpError(500, 'Lưu ảnh thất bại');
    }

    if (oldKey && oldKey !== fileKey) {
      await deleteObject(oldKey).catch((e) =>
        console.warn('best-effort delete of old expense image failed', e),
      );
    }

    return jsonResponse({ image_url: publicUrl });
  })
);
