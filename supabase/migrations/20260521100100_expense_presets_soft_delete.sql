-- expense_presets: chuyển từ hard-delete sang soft-delete cho offline-first.
--
-- Lý do: với write-through queue, mutation `deletePreset` có thể được replay 2 lần
-- (offline → online retry, hoặc 2 device cùng xóa). Hard-delete row second-call sẽ
-- không match WHERE clause → silent no-op, nhưng nếu RLS không cho phép DELETE
-- row đã NULL thì throw lỗi. Soft-delete `SET deleted_at = COALESCE(deleted_at, now())`
-- idempotent + delta pull thấy được change.
--
-- Hệ quả: partial unique indexes phải thêm `AND deleted_at IS NULL` để cho phép
-- user tạo lại preset cùng title sau khi xóa.

-- 1. Thêm cột deleted_at
ALTER TABLE public.expense_presets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Update partial unique indexes — thêm filter deleted_at IS NULL
DROP INDEX IF EXISTS idx_presets_unique_global;
DROP INDEX IF EXISTS idx_presets_unique_trip_scope;

CREATE UNIQUE INDEX idx_presets_unique_global
  ON public.expense_presets (user_id, title)
  WHERE trip_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_presets_unique_trip_scope
  ON public.expense_presets (user_id, title, trip_id)
  WHERE trip_id IS NOT NULL AND deleted_at IS NULL;

-- 3. Index query "preset của trip X" — filter deleted_at
DROP INDEX IF EXISTS idx_presets_trip;
CREATE INDEX idx_presets_trip
  ON public.expense_presets (trip_id)
  WHERE trip_id IS NOT NULL AND deleted_at IS NULL;

-- 4. Update RLS SELECT để filter ra preset đã xóa (UI không thấy)
-- Note: SELECT policy hiện không có trong migration trước — Supabase mặc định ENABLE RLS
-- sẽ block tất cả SELECT nếu không có policy. Check `\d expense_presets` để xem policy hiện có.
-- An toàn: re-define rõ ràng.

DROP POLICY IF EXISTS "Users read own presets" ON public.expense_presets;
CREATE POLICY "Users read own presets" ON public.expense_presets FOR SELECT
  USING (user_id = public.auth_user_id() AND deleted_at IS NULL);

-- 5. UPDATE policy đã có (migration 20260512300000) — vẫn cho phép user soft-delete preset
-- của chính mình (UPDATE SET deleted_at = now() WHERE user_id = auth_user_id()).
-- Service layer sẽ chuyển từ DELETE sang UPDATE SET deleted_at = now() ở Phase 1+.

-- 6. DELETE policy: vẫn giữ cho phép hard-delete (admin tool / cleanup cron tương lai).
-- Hiện không có DELETE policy → mặc định block. Không cần thêm.

COMMENT ON COLUMN public.expense_presets.deleted_at IS
  'Soft-delete timestamp. NULL = active. Service layer luôn UPDATE SET deleted_at = COALESCE(deleted_at, now()) cho idempotent replay khi offline sync.';
