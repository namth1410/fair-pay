// POST /group-avatar-remove
// Body: { groupId: string }
// Returns: {} or 4xx with error message.
import { getAppUserId, HttpError, jsonResponse, supabaseAdmin, withErrorHandling } from '../_shared/auth.ts';
import { deleteObject, extractFileKey } from '../_shared/r2.ts';

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const groupId = body?.groupId;
    if (typeof groupId !== 'string' || !groupId) {
      throw new HttpError(400, 'Thiếu groupId');
    }

    const userId = await getAppUserId(req);

    const { data, error } = await supabaseAdmin.rpc('remove_group_avatar', {
      p_group_id: groupId,
      p_user_id: userId,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('NOT_ADMIN')) {
        throw new HttpError(403, 'Chỉ admin mới được xóa avatar nhóm');
      }
      if (msg.includes('GROUP_NOT_FOUND')) {
        throw new HttpError(404, 'Không tìm thấy nhóm');
      }
      console.error('rpc remove_group_avatar failed:', error);
      throw new HttpError(500, 'Xóa avatar thất bại');
    }

    const result = Array.isArray(data) ? data[0] : data;
    const oldKey = extractFileKey(result?.old_avatar_url ?? null);
    if (oldKey) {
      await deleteObject(oldKey).catch((e) =>
        console.warn('best-effort delete on remove failed', e)
      );
    }

    return jsonResponse({});
  })
);
