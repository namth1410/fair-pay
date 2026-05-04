// POST /group-avatar-presign
// Body: { groupId: string, sizeBytes: number }
// Returns: { uploadUrl, fileKey, publicUrl } or 4xx with error message.
import { getAppUserId, HttpError, jsonResponse, supabaseAdmin, withErrorHandling } from '../_shared/auth.ts';
import { getPublicUrl, presignPutUrl } from '../_shared/r2.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const QUOTA_PER_GROUP_PER_WEEK = 3;
const QUOTA_PER_USER_PER_DAY = 20;
const CONTENT_TYPE = 'image/jpeg';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const groupId = body?.groupId;
    const sizeBytes = body?.sizeBytes;

    if (typeof groupId !== 'string' || !groupId) {
      throw new HttpError(400, 'Thiếu groupId');
    }
    if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new HttpError(400, 'sizeBytes không hợp lệ');
    }
    if (sizeBytes > MAX_BYTES) {
      throw new HttpError(413, 'Ảnh vượt quá 2 MB');
    }

    const userId = await getAppUserId(req);

    // Verify admin role of this user in the group
    const { data: roleRow } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (!roleRow || roleRow.role !== 'admin') {
      throw new HttpError(403, 'Chỉ admin mới được đổi avatar nhóm');
    }

    // Soft quota check (commit step rechecks under lock).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ count: groupCount }, { count: userCount }] = await Promise.all([
      supabaseAdmin
        .from('group_avatar_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .gt('created_at', sevenDaysAgo),
      supabaseAdmin
        .from('group_avatar_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId)
        .gt('created_at', oneDayAgo),
    ]);

    if ((groupCount ?? 0) >= QUOTA_PER_GROUP_PER_WEEK) {
      // Compute when oldest upload in window will roll off.
      const { data: oldest } = await supabaseAdmin
        .from('group_avatar_uploads')
        .select('created_at')
        .eq('group_id', groupId)
        .gt('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const retryAfter = oldest
        ? Math.max(
            1,
            Math.ceil(
              (new Date(oldest.created_at).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / 1000
            )
          )
        : 7 * 24 * 60 * 60;
      throw new HttpError(429, 'Nhóm đã đổi avatar tối đa 3 lần trong 7 ngày', { retryAfter });
    }

    if ((userCount ?? 0) >= QUOTA_PER_USER_PER_DAY) {
      throw new HttpError(429, 'Bạn đã đổi avatar tối đa 20 lần trong ngày', {
        retryAfter: 24 * 60 * 60,
      });
    }

    const fileKey = `groups/${groupId}/${Date.now()}-${randomHex(8)}.jpg`;
    const uploadUrl = await presignPutUrl(fileKey, sizeBytes, CONTENT_TYPE, 60);
    const publicUrl = getPublicUrl(fileKey);

    return jsonResponse({ uploadUrl, fileKey, publicUrl });
  })
);
