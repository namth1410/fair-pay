// POST /expense-image-presign
// Body: { expenseId: string, tripId: string, sizeBytes: number }
// Returns: { uploadUrl, fileKey, publicUrl } or 4xx with error message.
//
// Khác avatar: expense chưa tồn tại khi presign (client gen UUID trước
// INSERT) → authorization check qua tripId (caller phải là active member
// của trip's group). expenseId chỉ là namespace key trong R2.
import {
  getAppUserId,
  HttpError,
  jsonResponse,
  supabaseAdmin,
  withErrorHandling,
} from '../_shared/auth.ts';
import { getPublicUrl, presignPutUrl } from '../_shared/r2.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const QUOTA_PER_USER_PER_DAY = 100;
const QUOTA_PER_GROUP_PER_DAY = 50;
const CONTENT_TYPE = 'image/jpeg';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (
      typeof sizeBytes !== 'number' ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0
    ) {
      throw new HttpError(400, 'sizeBytes không hợp lệ');
    }
    if (sizeBytes > MAX_BYTES) {
      throw new HttpError(413, 'Ảnh vượt quá 2 MB');
    }

    const userId = await getAppUserId(req);

    // Resolve trip → group, verify caller is active member
    const { data: tripRow } = await supabaseAdmin
      .from('trips')
      .select('group_id')
      .eq('id', tripId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!tripRow) throw new HttpError(404, 'Không tìm thấy chuyến đi');
    const groupId = tripRow.group_id as string;

    const { data: memberRow } = await supabaseAdmin
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (!memberRow) {
      throw new HttpError(403, 'Bạn không thuộc nhóm này');
    }

    // Soft quota check (24h window)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: userCount }, { count: groupCount }] = await Promise.all([
      supabaseAdmin
        .from('expense_image_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId)
        .gt('created_at', oneDayAgo),
      supabaseAdmin
        .from('expense_image_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .gt('created_at', oneDayAgo),
    ]);

    if ((userCount ?? 0) >= QUOTA_PER_USER_PER_DAY) {
      throw new HttpError(429, 'Bạn đã upload tối đa 100 ảnh trong ngày', {
        retryAfter: 24 * 60 * 60,
      });
    }
    if ((groupCount ?? 0) >= QUOTA_PER_GROUP_PER_DAY) {
      throw new HttpError(
        429,
        'Nhóm đã upload tối đa 50 ảnh khoản chi trong ngày',
        { retryAfter: 24 * 60 * 60 },
      );
    }

    const fileKey = `expenses/${expenseId}/${Date.now()}-${randomHex(8)}.jpg`;
    const uploadUrl = await presignPutUrl(fileKey, sizeBytes, CONTENT_TYPE, 60);
    const publicUrl = getPublicUrl(fileKey);

    // Insert quota row at presign time. Edge case: if PUT fails downstream,
    // user "wastes" a quota slot. Acceptable for Phase 1 (vs. atomic
    // commit-time insert which adds round trip).
    await supabaseAdmin.from('expense_image_uploads').insert({
      expense_id: expenseId,
      group_id: groupId,
      uploaded_by: userId,
      file_key: fileKey,
    });

    return jsonResponse({ uploadUrl, fileKey, publicUrl });
  }),
);
