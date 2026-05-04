// =============================================================================
// group-avatar-remove — bundled standalone for Supabase Dashboard upload
// =============================================================================
// Source of truth: supabase/functions/group-avatar-remove/index.ts
//                  + supabase/functions/_shared/{r2,auth}.ts
// =============================================================================
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? '';
const PUBLIC_BASE_URL = (Deno.env.get('R2_PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET || !PUBLIC_BASE_URL) {
  throw new Error('Missing R2 secrets');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL / ANON / SERVICE_ROLE');
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

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const groupId = body?.groupId;
    if (typeof groupId !== 'string' || !groupId) throw new HttpError(400, 'Thiếu groupId');

    const userId = await getAppUserId(req);

    const { data, error } = await supabaseAdmin.rpc('remove_group_avatar', {
      p_group_id: groupId,
      p_user_id: userId,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('NOT_ADMIN')) throw new HttpError(403, 'Chỉ admin mới được xóa avatar nhóm');
      if (msg.includes('GROUP_NOT_FOUND')) throw new HttpError(404, 'Không tìm thấy nhóm');
      console.error('rpc remove_group_avatar failed:', error);
      throw new HttpError(500, 'Xóa avatar thất bại');
    }

    const result = Array.isArray(data) ? data[0] : data;
    const oldKey = extractFileKey(result?.old_avatar_url ?? null);
    if (oldKey) {
      await deleteObject(oldKey).catch((e) => console.warn('best-effort delete on remove failed', e));
    }

    return jsonResponse({});
  })
);
