-- ============================================================================
-- Rate limiting (sliding-window) chống abuse — pre-release (2026-06-04)
--
-- Bối cảnh: anon key nằm trong APK → authed user (hoặc account bị chiếm) có thể
-- gọi DB trực tiếp, spam create_expense/payment/trip/group/add_virtual_member
-- hàng nghìn lần → phình DB (free tier 500MB) + dội notification/FCM cả nhóm.
--
-- Cơ chế: BEFORE INSERT trigger trên 5 bảng domain (choke point thật — fire bất
-- kể insert qua RPC hay trực tiếp; RLS INSERT của expenses/payments chỉ check
-- is_member nên client né được RPC). Sliding window: COUNT row trong cửa sổ trượt.
--   • Đếm CẢ row đã soft-delete (KHÔNG filter deleted_at) → chặn bypass
--     create→delete→create reset bộ đếm.
--   • SECURITY DEFINER + search_path → COUNT bypass RLS, đếm chính xác toàn nhóm.
--   • RAISE 'rate_limit_exceeded' USING ERRCODE 'P0429' (custom) → client phân loại
--     riêng: sync queue retry fixed-backoff 30' KHÔNG dead-letter (xem
--     src/sync/syncQueue.ts), UI hiện toast tiếng Việt (src/utils/error.ts).
--
-- Ngưỡng (hào phóng — đỉnh hợp lệ ~vài chục, abuse ~nghìn; batch offline không chạm):
--   expenses : per created_by 300/1h, per group_id 500/1h
--   payments : per recorded_by 200/1h
--   trips    : per created_by 60/1d
--   groups   : per created_by 30/1d
--   group_members (chỉ is_virtual) : per group_id 100/1d
--
-- Spoof guard (đính kèm — đóng lỗ hổng audit phát hiện): RLS INSERT expenses/
-- payments KHÔNG ép created_by = người gọi → member có thể direct-insert đổ tội/né
-- limit per-user. Trigger RAISE 42501 nếu created_by/recorded_by <> auth_user_id(),
-- CHỈ khi auth_user_id() IS NOT NULL (miễn trừ service_role/server tin cậy). Không
-- cản nghiệp vụ "member thêm khoản chi/thanh toán" (chỉ ép cột người-ghi trung
-- thực; paid_by/splits không đụng). Nếu sau làm "tạo hộ" thì nới guard có chủ đích.
-- ============================================================================

-- ── Indexes (đặt đầu) ────────────────────────────────────────────────────────
-- Composite (actor|group, created_at) để COUNT là index-range scan (window bound).
-- Index group_id sẵn có là PARTIAL (WHERE deleted_at IS NULL) → KHÔNG dùng được cho
-- COUNT gồm-soft-deleted → tạo non-partial mới. Các (actor, created_at) cũng clear
-- cảnh báo "unindexed foreign key" của advisor. KHÔNG dùng CONCURRENTLY (migration
-- chạy trong transaction; bảng nhỏ).
CREATE INDEX IF NOT EXISTS idx_expenses_created_by_created_at  ON public.expenses (created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_group_created_at       ON public.expenses (group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by_created_at ON public.payments (recorded_by, created_at);
CREATE INDEX IF NOT EXISTS idx_trips_created_by_created_at     ON public.trips (created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_groups_created_by_created_at    ON public.groups (created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_group_members_group_joined_virtual
  ON public.group_members (group_id, joined_at) WHERE is_virtual = true;

-- ── Trigger functions ────────────────────────────────────────────────────────
-- >= ngưỡng (không phải >) vì BEFORE INSERT: NEW chưa nằm trong bảng nên COUNT là
-- số row HIỆN CÓ; chặn đúng tại lần thứ (ngưỡng+1).

CREATE OR REPLACE FUNCTION public.enforce_expense_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_count int;
  v_group_count int;
BEGIN
  IF public.auth_user_id() IS NOT NULL
     AND NEW.created_by IS DISTINCT FROM public.auth_user_id() THEN
    RAISE EXCEPTION 'actor_spoof' USING ERRCODE = '42501',
      HINT = 'created_by phải bằng người gọi';
  END IF;

  SELECT count(*) INTO v_user_count
    FROM public.expenses
   WHERE created_by = NEW.created_by
     AND created_at > now() - interval '1 hour';
  IF v_user_count >= 300 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0429', HINT = 'expense:user:300/1h';
  END IF;

  SELECT count(*) INTO v_group_count
    FROM public.expenses
   WHERE group_id = NEW.group_id
     AND created_at > now() - interval '1 hour';
  IF v_group_count >= 500 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0429', HINT = 'expense:group:500/1h';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_payment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF public.auth_user_id() IS NOT NULL
     AND NEW.recorded_by IS DISTINCT FROM public.auth_user_id() THEN
    RAISE EXCEPTION 'actor_spoof' USING ERRCODE = '42501',
      HINT = 'recorded_by phải bằng người gọi';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.payments
   WHERE recorded_by = NEW.recorded_by
     AND created_at > now() - interval '1 hour';
  IF v_count >= 200 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0429', HINT = 'payment:user:200/1h';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_trip_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF public.auth_user_id() IS NOT NULL
     AND NEW.created_by IS DISTINCT FROM public.auth_user_id() THEN
    RAISE EXCEPTION 'actor_spoof' USING ERRCODE = '42501',
      HINT = 'created_by phải bằng người gọi';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.trips
   WHERE created_by = NEW.created_by
     AND created_at > now() - interval '1 day';
  IF v_count >= 60 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0429', HINT = 'trip:user:60/1d';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_group_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF public.auth_user_id() IS NOT NULL
     AND NEW.created_by IS DISTINCT FROM public.auth_user_id() THEN
    RAISE EXCEPTION 'actor_spoof' USING ERRCODE = '42501',
      HINT = 'created_by phải bằng người gọi';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.groups
   WHERE created_by = NEW.created_by
     AND created_at > now() - interval '1 day';
  IF v_count >= 30 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0429', HINT = 'group:user:30/1d';
  END IF;

  RETURN NEW;
END;
$$;

-- group_members: KHÔNG có cột actor (admin thực hiện, audit_log ghi actor riêng) →
-- không có spoof guard. Chỉ giới hạn thành viên ẢO per nhóm. Window = joined_at
-- (bảng này không có created_at).
CREATE OR REPLACE FUNCTION public.enforce_virtual_member_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.group_members
   WHERE group_id = NEW.group_id
     AND is_virtual = true
     AND joined_at > now() - interval '1 day';
  IF v_count >= 100 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0429', HINT = 'virtual_member:group:100/1d';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Revoke (trigger func chạy as owner; không ai cần EXECUTE trực tiếp) ────────
REVOKE ALL ON FUNCTION public.enforce_expense_rate_limit()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_payment_rate_limit()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_trip_rate_limit()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_group_rate_limit()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_virtual_member_rate_limit() FROM PUBLIC, anon, authenticated;

-- ── Triggers (idempotent) ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_expenses_rate_limit ON public.expenses;
CREATE TRIGGER trg_expenses_rate_limit
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_rate_limit();

DROP TRIGGER IF EXISTS trg_payments_rate_limit ON public.payments;
CREATE TRIGGER trg_payments_rate_limit
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_rate_limit();

DROP TRIGGER IF EXISTS trg_trips_rate_limit ON public.trips;
CREATE TRIGGER trg_trips_rate_limit
  BEFORE INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_rate_limit();

DROP TRIGGER IF EXISTS trg_groups_rate_limit ON public.groups;
CREATE TRIGGER trg_groups_rate_limit
  BEFORE INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_group_rate_limit();

-- WHEN (NEW.is_virtual = true): chỉ chạy cho thành viên ảo; bỏ qua creator membership
-- (create_group) và real member (approve_join_request). NULL = true → bỏ qua (an toàn).
DROP TRIGGER IF EXISTS trg_group_members_rate_limit ON public.group_members;
CREATE TRIGGER trg_group_members_rate_limit
  BEFORE INSERT ON public.group_members
  FOR EACH ROW
  WHEN (NEW.is_virtual = true)
  EXECUTE FUNCTION public.enforce_virtual_member_rate_limit();

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.enforce_expense_rate_limit() IS
  'BEFORE INSERT expenses rate limit: user 300/1h, group 500/1h (gồm soft-deleted). Errcodes: P0429 (rate_limit_exceeded), 42501 (actor_spoof).';
COMMENT ON FUNCTION public.enforce_payment_rate_limit() IS
  'BEFORE INSERT payments rate limit: user 200/1h (gồm soft-deleted). Errcodes: P0429 (rate_limit_exceeded), 42501 (actor_spoof).';
COMMENT ON FUNCTION public.enforce_trip_rate_limit() IS
  'BEFORE INSERT trips rate limit: user 60/1d (gồm soft-deleted). Errcodes: P0429 (rate_limit_exceeded), 42501 (actor_spoof).';
COMMENT ON FUNCTION public.enforce_group_rate_limit() IS
  'BEFORE INSERT groups rate limit: user 30/1d (gồm soft-deleted). Errcodes: P0429 (rate_limit_exceeded), 42501 (actor_spoof).';
COMMENT ON FUNCTION public.enforce_virtual_member_rate_limit() IS
  'BEFORE INSERT group_members (chỉ is_virtual) rate limit: group 100/1d theo joined_at. Errcode: P0429 (rate_limit_exceeded).';
