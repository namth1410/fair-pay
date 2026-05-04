// POST /group-avatar-cleanup
// No body. Lists R2 objects under groups/ prefix and deletes those not
// referenced by any current groups.avatar_url, while protecting recent
// uploads (last 24h) to avoid racing with in-flight commits.
//
// Schedule via pg_cron weekly:
//   SELECT cron.schedule('cleanup-group-avatars-weekly',
//     '0 20 * * 0',  -- 03:00 ICT Sunday = 20:00 UTC Saturday
//     $$SELECT net.http_post(
//       url:='https://<project>.supabase.co/functions/v1/group-avatar-cleanup',
//       headers:=jsonb_build_object(
//         'Authorization', 'Bearer ' || '<service_role_key>',
//         'Content-Type', 'application/json'
//       ),
//       body:='{}'::jsonb
//     )$$);
import { HttpError, jsonResponse, supabaseAdmin, withErrorHandling } from '../_shared/auth.ts';
import { deleteObject, extractFileKey } from '../_shared/r2.ts';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? '';
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const aws = new AwsClient({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  region: 'auto',
  service: 's3',
});

async function listAllKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | null = null;
  // Hard cap pagination to avoid runaway loops on a misconfigured bucket.
  for (let page = 0; page < 50; page++) {
    const url = new URL(`${ENDPOINT}/${BUCKET}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken);
    }
    const res = await aws.fetch(url.toString(), { method: 'GET' });
    if (!res.ok) {
      throw new Error(`R2 LIST failed: ${res.status} ${res.statusText}`);
    }
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      keys.push(m[1]);
    }
    const truncatedMatch = xml.match(/<IsTruncated>([^<]+)<\/IsTruncated>/);
    if (truncatedMatch?.[1] !== 'true') break;
    const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = tokenMatch?.[1] ?? null;
    if (!continuationToken) break;
  }
  return keys;
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const r2Keys = await listAllKeys('groups/');

    const { data: groupRows, error: groupErr } = await supabaseAdmin
      .from('groups')
      .select('avatar_url')
      .not('avatar_url', 'is', null);
    if (groupErr) throw groupErr;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentRows, error: recentErr } = await supabaseAdmin
      .from('group_avatar_uploads')
      .select('file_key')
      .gt('created_at', oneDayAgo);
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
    let deleted = 0;
    let failed = 0;
    for (const key of orphans) {
      try {
        await deleteObject(key);
        deleted++;
      } catch (e) {
        console.warn('cleanup delete failed:', key, e);
        failed++;
      }
    }

    return jsonResponse({
      total_r2: r2Keys.length,
      referenced: referenced.size,
      orphans: orphans.length,
      deleted,
      failed,
    });
  })
);
