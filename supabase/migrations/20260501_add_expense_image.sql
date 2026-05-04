-- Phase 1 — Expense image attach feature
-- 1. Thêm cột image_url cho bảng expenses (nullable, store public R2 URL)
-- 2. Bảng expense_image_uploads để track quota per user/group/24h
-- Bucket dùng chung với avatar (R2 'fairpay'), prefix khác (expenses/...)

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

CREATE TABLE IF NOT EXISTS expense_image_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eiu_user_time
  ON expense_image_uploads(uploaded_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eiu_group_time
  ON expense_image_uploads(group_id, created_at DESC);

-- RLS: service role bypass (Edge Functions). Block direct client access.
ALTER TABLE expense_image_uploads ENABLE ROW LEVEL SECURITY;

-- Không tạo SELECT/INSERT policy cho client — chỉ Edge Functions (service role)
-- ghi/đọc bảng này. Client query qua presign/commit/remove RPCs.
