-- Offline-first foundation: thêm `version` + `updated_at` + `client_request_id` cho các
-- bảng mutable để support write-through queue + optimistic concurrency.
--
-- Pattern:
--   - `version INT NOT NULL DEFAULT 1`: tăng +1 mỗi UPDATE qua trigger. RPC update nhận
--     `p_base_version` → match thì UPDATE, không match → RAISE P0410 (conflict).
--   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`: refresh qua trigger. Dùng cho
--     delta pull watermark + settings LWW.
--   - `client_request_id UUID UNIQUE`: idempotency key cho RPC create. Replay queue 2 lần
--     → 2nd lần UPSERT detect duplicate → no-op. NULLable cho row tạo server-side
--     (vd group_members do RPC approve_join_request tạo).
--
-- Notes:
--   - `expenses` đã có `version` từ migration 0501 (chuẩn bị sẵn). Chỉ thêm
--     `updated_at` + `client_request_id`.
--   - `expense_presets` đã có `updated_at` + trigger. Thêm `version` + `client_request_id`.
--   - `audit_logs` thêm `client_created_at` để giữ chronological order khi sync trễ
--     (client time có thể lệch nhưng vẫn dùng để sort UI; `created_at` server time vẫn
--     là source of truth cho compliance).
--   - `users` KHÔNG có `client_request_id` (user tạo qua auth flow, không qua RPC create).
--   - `pinned_trips` chỉ cần `updated_at` (idempotent ops, không cần version).
--   - `notifications` chỉ cần `updated_at` (server-driven, client chỉ mark read).

-- ============================================================================
-- 1. Generic trigger functions
-- ============================================================================

-- Tăng version +1 + refresh updated_at mỗi UPDATE. Bỏ qua nếu chỉ touch `deleted_at`
-- (soft-delete vẫn tăng version để pull cho thấy thay đổi, nhưng không gây conflict
-- vì soft-delete idempotent).
CREATE OR REPLACE FUNCTION public.bump_version_and_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Tránh infinite loop khi UPDATE đến từ chính trigger
  IF NEW.version IS DISTINCT FROM OLD.version
     AND NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    -- Caller đã set tay (RPC), không tự tăng nữa
    RETURN NEW;
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Chỉ refresh updated_at (cho bảng không có version)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. users: version + updated_at (KHÔNG client_request_id — auth flow tạo)
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.users SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_users_bump_version ON public.users;
CREATE TRIGGER trg_users_bump_version
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 3. groups: version + updated_at + client_request_id
-- ============================================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.groups SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_client_request_id
  ON public.groups(client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_groups_bump_version ON public.groups;
CREATE TRIGGER trg_groups_bump_version
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 4. group_members: version + updated_at + client_request_id
-- ============================================================================

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.group_members SET updated_at = COALESCE(joined_at, now()) WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_client_request_id
  ON public.group_members(client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_group_members_bump_version ON public.group_members;
CREATE TRIGGER trg_group_members_bump_version
  BEFORE UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 5. trips: version + updated_at + client_request_id
-- ============================================================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.trips SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_client_request_id
  ON public.trips(client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_trips_bump_version ON public.trips;
CREATE TRIGGER trg_trips_bump_version
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 6. expenses: updated_at + client_request_id (version đã có)
-- ============================================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.expenses SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_client_request_id
  ON public.expenses(client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_expenses_bump_version ON public.expenses;
CREATE TRIGGER trg_expenses_bump_version
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 7. payments: version + updated_at + client_request_id
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

UPDATE public.payments SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_client_request_id
  ON public.payments(client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_payments_bump_version ON public.payments;
CREATE TRIGGER trg_payments_bump_version
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 8. expense_presets: version + client_request_id (updated_at + trigger đã có)
-- ============================================================================

ALTER TABLE public.expense_presets
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_presets_client_request_id
  ON public.expense_presets(client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Trigger hiện tại của expense_presets dùng pattern khác (AFTER UPDATE set updated_at = now()
-- qua statement riêng). Drop và replace bằng BEFORE UPDATE để bump version + updated_at
-- nguyên tử trong cùng row.
DROP TRIGGER IF EXISTS trg_expense_presets_updated_at ON public.expense_presets;
DROP TRIGGER IF EXISTS trg_expense_presets_bump_version ON public.expense_presets;
CREATE TRIGGER trg_expense_presets_bump_version
  BEFORE UPDATE ON public.expense_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_and_updated_at();

-- ============================================================================
-- 9. pinned_trips: updated_at (KHÔNG version — idempotent ops)
-- ============================================================================

ALTER TABLE public.pinned_trips
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.pinned_trips SET updated_at = COALESCE(pinned_at, now()) WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_pinned_trips_set_updated_at ON public.pinned_trips;
CREATE TRIGGER trg_pinned_trips_set_updated_at
  BEFORE UPDATE ON public.pinned_trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 10. notifications: updated_at (server-driven, client chỉ mark read)
-- ============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.notifications SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_notifications_set_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_set_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 11. group_invitations: updated_at (server-driven status changes)
-- ============================================================================

ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.group_invitations SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_group_invitations_set_updated_at ON public.group_invitations;
CREATE TRIGGER trg_group_invitations_set_updated_at
  BEFORE UPDATE ON public.group_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 12. audit_logs: client_created_at (clock-skew-safe ordering cho offline replay)
-- ============================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;

COMMENT ON COLUMN public.audit_logs.client_created_at IS
  'Client-side timestamp khi action thực sự xảy ra. NULL cho action server-tạo. Dùng cho UI sort khi user offline replay queue trễ — created_at (server time) vẫn là source of truth cho compliance/forensic.';

-- ============================================================================
-- 13. Indexes cho delta pull watermark — partial idx tối ưu cho updated_at > X
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_groups_updated_at ON public.groups(updated_at);
CREATE INDEX IF NOT EXISTS idx_group_members_updated_at ON public.group_members(updated_at);
CREATE INDEX IF NOT EXISTS idx_trips_updated_at ON public.trips(updated_at);
CREATE INDEX IF NOT EXISTS idx_expenses_updated_at ON public.expenses(updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_updated_at ON public.payments(updated_at);
CREATE INDEX IF NOT EXISTS idx_expense_presets_updated_at ON public.expense_presets(updated_at);
CREATE INDEX IF NOT EXISTS idx_pinned_trips_updated_at ON public.pinned_trips(updated_at);
CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON public.notifications(updated_at);
CREATE INDEX IF NOT EXISTS idx_group_invitations_updated_at ON public.group_invitations(updated_at);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON public.users(updated_at);

-- ============================================================================
-- 14. Comments
-- ============================================================================

COMMENT ON FUNCTION public.bump_version_and_updated_at() IS
  'Trigger function: BEFORE UPDATE → NEW.version = OLD.version + 1, NEW.updated_at = now(). Skip nếu caller set tay (RPC override).';

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger function: BEFORE UPDATE → NEW.updated_at = now(). Dùng cho bảng không có version.';
