// POST /group-avatar-commit
// Body: { groupId: string, fileKey: string }
// Returns: { avatar_url } or 4xx with error message.
// Verifies the uploaded R2 object, then atomically updates DB via RPC.
import { getAppUserId, HttpError, jsonResponse, supabaseAdmin, withErrorHandling } from '../_shared/auth.ts';
import { deleteObject, extractFileKey, getPublicUrl, headObject } from '../_shared/r2.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const QUOTA_PER_GROUP_PER_WEEK = 3;
const QUOTA_PER_USER_PER_DAY = 20;

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const groupId = body?.groupId;
    const fileKey = body?.fileKey;

    if (typeof groupId !== 'string' || !groupId) {
      throw new HttpError(400, 'Thiếu groupId');
    }
    if (typeof fileKey !== 'string' || !fileKey) {
      throw new HttpError(400, 'Thiếu fileKey');
    }
    if (!fileKey.startsWith(`groups/${groupId}/`)) {
      throw new HttpError(403, 'fileKey không thuộc nhóm này');
    }

    const userId = await getAppUserId(req);

    // Verify the uploaded object exists and matches our constraints.
    const head = await headObject(fileKey);
    if (!head.exists) {
      throw new HttpError(400, 'Chưa thấy file upload, thử lại');
    }
    if (head.size > MAX_BYTES) {
      // Defensive: size signed in URL but verify anyway.
      await deleteObject(fileKey).catch((e) => console.warn('cleanup oversize failed', e));
      throw new HttpError(413, 'File vượt quá 2 MB');
    }
    if (!head.contentType.startsWith('image/')) {
      await deleteObject(fileKey).catch((e) => console.warn('cleanup bad-type failed', e));
      throw new HttpError(415, 'Định dạng file không hợp lệ');
    }

    const publicUrl = getPublicUrl(fileKey);

    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('commit_group_avatar', {
      p_group_id: groupId,
      p_user_id: userId,
      p_new_file_key: fileKey,
      p_new_public_url: publicUrl,
      p_quota_per_group_per_week: QUOTA_PER_GROUP_PER_WEEK,
      p_quota_per_user_per_day: QUOTA_PER_USER_PER_DAY,
    });

    if (rpcErr) {
      // Postgres RAISE EXCEPTION 'X' surfaces in message.
      const msg = rpcErr.message || '';
      // Best-effort cleanup of the just-uploaded file since we won't reference it.
      await deleteObject(fileKey).catch((e) => console.warn('cleanup after rpc fail', e));
      if (msg.includes('NOT_ADMIN')) {
        throw new HttpError(403, 'Chỉ admin mới được đổi avatar nhóm');
      }
      if (msg.includes('GROUP_NOT_FOUND')) {
        throw new HttpError(404, 'Không tìm thấy nhóm');
      }
      console.error('rpc commit_group_avatar failed:', rpcErr);
      throw new HttpError(500, 'Lưu avatar thất bại');
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const retryAfter = result?.retry_after_seconds ?? 0;

    if (retryAfter > 0) {
      // Quota exceeded discovered under lock — throw away just-uploaded file.
      await deleteObject(fileKey).catch((e) => console.warn('cleanup after quota fail', e));
      throw new HttpError(429, 'Vượt giới hạn đổi avatar', { retryAfter });
    }

    // Best-effort delete of the previous file to free R2 storage.
    const oldKey = extractFileKey(result?.old_avatar_url ?? null);
    if (oldKey && oldKey !== fileKey) {
      await deleteObject(oldKey).catch((e) =>
        console.warn('best-effort delete of old avatar failed', e)
      );
    }

    return jsonResponse({ avatar_url: publicUrl });
  })
);
