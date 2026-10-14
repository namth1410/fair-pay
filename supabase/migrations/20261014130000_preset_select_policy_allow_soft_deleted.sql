-- Sửa lỗi KHÔNG xoá được preset (cả app lẫn web) từ khi preset chuyển sang soft delete
-- (migration 20260521100100_expense_presets_soft_delete).
--
-- Nguyên nhân: policy SELECT "Users read own presets" có `deleted_at IS NULL`. Lệnh xoá mềm
-- là UPDATE ... SET deleted_at = now() WHERE id = ... (PostgREST luôn có WHERE). UPDATE cần
-- quyền đọc cột ở WHERE → Postgres áp USING của policy SELECT lên CẢ hàng mới; hàng mới đã
-- có deleted_at nên trượt → 42501 "new row violates row-level security policy".
--
-- Sửa: policy SELECT chỉ còn kiểm chủ sở hữu; việc ẩn preset đã xoá do client tự lọc
-- (app: preset.service fetch `.is('deleted_at', null)` + SQLite `deleted_at IS NULL`;
-- web: preset.service `.is('deleted_at', null)`). Lợi ích kèm theo: pull delta của app giờ
-- thấy được hàng đã xoá mềm → lệnh xoá từ thiết bị khác về được mirror local (trước đây
-- hàng xoá "biến mất" khỏi SELECT nên mirror giữ preset ma).
-- ALTER POLICY giữ nguyên command/roles, chỉ đổi biểu thức USING.

ALTER POLICY "Users read own presets" ON public.expense_presets
  USING (user_id = public.auth_user_id());
