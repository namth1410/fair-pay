// POST /expense-image-remove
// Body: { expenseId: string }
// Returns: {} on success.
//
// Idempotent: gọi lại sau khi xóa OK. Dùng từ:
// - Client deleteExpense (Phase 1, gọi tự động sau soft-delete)
// - Edit flow Phase 2 (user xóa ảnh đính kèm)
import {
  getAppUserId,
  HttpError,
  jsonResponse,
  supabaseAdmin,
  withErrorHandling,
} from '../_shared/auth.ts';
import { deleteObject, extractFileKey } from '../_shared/r2.ts';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(
  withErrorHandling(async (req: Request) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

    const body = await req.json().catch(() => null);
    const expenseId = body?.expenseId;

    if (typeof expenseId !== 'string' || !UUID_REGEX.test(expenseId)) {
      throw new HttpError(400, 'expenseId không hợp lệ');
    }

    const userId = await getAppUserId(req);

    // Cho phép gọi trên expense đã soft-deleted (client deleteExpense flow):
    // không thêm `is('deleted_at', null)` filter.
    const { data: expenseRow } = await supabaseAdmin
      .from('expenses')
      .select('group_id, image_url, created_by')
      .eq('id', expenseId)
      .maybeSingle();

    if (!expenseRow) {
      // Idempotent: nếu expense đã hard-delete hoặc chưa tồn tại, coi như OK
      return jsonResponse({});
    }

    const { data: memberRow } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', expenseRow.group_id)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (!memberRow) throw new HttpError(403, 'Bạn không thuộc nhóm này');
    if (memberRow.role !== 'admin' && expenseRow.created_by !== userId) {
      throw new HttpError(403, 'Chỉ admin hoặc người tạo mới được xóa ảnh');
    }

    const fileKey = extractFileKey(expenseRow.image_url ?? null);
    if (fileKey) {
      await deleteObject(fileKey).catch((e) =>
        console.warn('R2 delete failed (idempotent):', e),
      );
    }

    if (expenseRow.image_url) {
      await supabaseAdmin
        .from('expenses')
        .update({ image_url: null })
        .eq('id', expenseId);
    }

    return jsonResponse({});
  }),
);
