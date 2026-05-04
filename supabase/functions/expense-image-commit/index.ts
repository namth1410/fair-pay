// POST /expense-image-commit
// Body: { expenseId: string, fileKey: string }
// Returns: { image_url } or 4xx.
//
// Phase 1 unused trên client (INSERT expense client-side đã set image_url).
// Endpoint này dành cho Phase 2 edit-image flow: user đổi ảnh expense đã có.
// Verify HEAD object → UPDATE expenses.image_url. Cleanup ảnh cũ best-effort.
import {
  getAppUserId,
  HttpError,
  jsonResponse,
  supabaseAdmin,
  withErrorHandling,
} from '../_shared/auth.ts';
import {
  deleteObject,
  extractFileKey,
  getPublicUrl,
  headObject,
} from '../_shared/r2.ts';

const MAX_BYTES = 2 * 1024 * 1024;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      .from('expenses')
      .select('group_id, image_url, paid_by, created_by')
      .eq('id', expenseId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!expenseRow) throw new HttpError(404, 'Không tìm thấy khoản chi');

    // Authorization: caller phải là active member của group + là admin hoặc
    // người tạo expense. Logic giống deleteExpense ở client side.
    const { data: memberRow } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', expenseRow.group_id)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (!memberRow) throw new HttpError(403, 'Bạn không thuộc nhóm này');
    if (memberRow.role !== 'admin' && expenseRow.created_by !== userId) {
      throw new HttpError(403, 'Chỉ admin hoặc người tạo mới được đổi ảnh');
    }

    // Verify uploaded object exists and is valid.
    const head = await headObject(fileKey);
    if (!head.exists) {
      throw new HttpError(400, 'Chưa thấy file upload, thử lại');
    }
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
      .from('expenses')
      .update({ image_url: publicUrl })
      .eq('id', expenseId);

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
  }),
);
