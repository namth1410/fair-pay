// Shared auth helpers for Edge Functions.
// Uses anon client to verify the user's JWT, then service-role client to
// resolve their app-level users.id (mirrors src/services/auth.helper.ts).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** Verify Authorization header → return app-level users.id. */
export async function getAppUserId(req: Request): Promise<string> {
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
    .from('users')
    .select('id')
    .eq('auth_id', data.user.id)
    .single();

  if (rowErr || !row) throw new HttpError(401, 'User chưa khởi tạo');
  return row.id as string;
}

/** Standard JSON response with CORS for app-side fetch. */
export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      ...extraHeaders,
    },
  });
}

export function corsPreflight(): Response {
  return jsonResponse({}, 204);
}

/** Wraps an async handler and converts HttpError + uncaught throws to JSON responses. */
export function withErrorHandling(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return corsPreflight();
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
