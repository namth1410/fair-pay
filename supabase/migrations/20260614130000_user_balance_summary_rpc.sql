-- get_user_balance_summary: tính balance của caller trên MỌI chuyến đang mở,
-- gom theo group, trả về (group_id, balance). Thay cho 3 round-trip waterfall
-- client-side (memberships → trips → expenses/splits/payments) + kéo TOÀN BỘ
-- expenses/splits/payments của người khác về máy chỉ để rút ra số của riêng user.
--
-- Công thức (mirror computeBalances trong src/utils/balance.ts, chỉ cho member
-- của chính caller):
--   balance = Σ(expenses.amount nơi paid_by = me)          -- payer được ghi có
--           − Σ(expense_splits.amount nơi member_id = me)   -- phần phải gánh
--           + Σ(payments.amount nơi from_member_id = me)    -- trả nợ → balance lên
--           − Σ(payments.amount nơi to_member_id = me)      -- nhận lại → balance xuống
--
-- Chỉ tính chuyến status='open' + chưa xóa; expenses/payments chưa xóa; membership
-- của caller còn active (left_at IS NULL). Chỉ trả group có ≥1 chuyến mở (khớp
-- vòng lặp theo trip ở aggregateBalanceSummary — group không có trip mở thì bỏ).
--
-- Bảo mật: SECURITY DEFINER nhưng chỉ đọc data của auth_user_id() → không lộ
-- chéo. STABLE (read-only). KHÔNG throw — trả rỗng nếu chưa auth / không có gì.
-- `balance` PHẢI khai bigint (cột amount là bigint; integer → 42804).

CREATE OR REPLACE FUNCTION public.get_user_balance_summary()
RETURNS TABLE(group_id uuid, balance bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH my_members AS (
    SELECT gm.id AS member_id, gm.group_id
    FROM public.group_members gm
    WHERE gm.user_id = public.auth_user_id()
      AND gm.left_at IS NULL
  ),
  open_trips AS (
    SELECT t.id AS trip_id, mm.group_id, mm.member_id
    FROM public.trips t
    JOIN my_members mm ON mm.group_id = t.group_id
    WHERE t.status = 'open'
      AND t.deleted_at IS NULL
  ),
  paid AS (
    SELECT ot.group_id, COALESCE(SUM(e.amount), 0) AS amt
    FROM public.expenses e
    JOIN open_trips ot ON ot.trip_id = e.trip_id AND e.paid_by = ot.member_id
    WHERE e.deleted_at IS NULL
    GROUP BY ot.group_id
  ),
  owed AS (
    SELECT ot.group_id, COALESCE(SUM(s.amount), 0) AS amt
    FROM public.expense_splits s
    JOIN public.expenses e ON e.id = s.expense_id AND e.deleted_at IS NULL
    JOIN open_trips ot ON ot.trip_id = e.trip_id AND s.member_id = ot.member_id
    GROUP BY ot.group_id
  ),
  pay_out AS (
    SELECT ot.group_id, COALESCE(SUM(p.amount), 0) AS amt
    FROM public.payments p
    JOIN open_trips ot ON ot.trip_id = p.trip_id AND p.from_member_id = ot.member_id
    WHERE p.deleted_at IS NULL
    GROUP BY ot.group_id
  ),
  pay_in AS (
    SELECT ot.group_id, COALESCE(SUM(p.amount), 0) AS amt
    FROM public.payments p
    JOIN open_trips ot ON ot.trip_id = p.trip_id AND p.to_member_id = ot.member_id
    WHERE p.deleted_at IS NULL
    GROUP BY ot.group_id
  ),
  groups_with_open_trips AS (
    SELECT DISTINCT group_id FROM open_trips
  )
  SELECT
    g.group_id,
    ( COALESCE(paid.amt, 0)
    - COALESCE(owed.amt, 0)
    + COALESCE(pay_out.amt, 0)
    - COALESCE(pay_in.amt, 0) )::bigint AS balance
  FROM groups_with_open_trips g
  LEFT JOIN paid    ON paid.group_id    = g.group_id
  LEFT JOIN owed    ON owed.group_id    = g.group_id
  LEFT JOIN pay_out ON pay_out.group_id = g.group_id
  LEFT JOIN pay_in  ON pay_in.group_id  = g.group_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_balance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_balance_summary() TO authenticated;

COMMENT ON FUNCTION public.get_user_balance_summary IS
  'Trả (group_id, balance bigint) — balance của caller trên các chuyến đang mở, gom theo group.
   Mirror computeBalances (src/utils/balance.ts) server-side để thay 3 round-trip + payload nặng.
   SECURITY DEFINER chỉ đọc data của auth_user_id(). Không throw — rỗng nếu chưa auth/không có gì.';
