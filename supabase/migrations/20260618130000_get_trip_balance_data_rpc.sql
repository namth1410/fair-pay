-- get_trip_balance_data: gom toàn bộ data tính balance của 1 trip trong 1 round-trip,
-- thay cho waterfall client-side ở fetchTripBalanceData (nhánh server cũ: 3 query song
-- song [expenses+splits, payments, trips.group_id] + 1 query group_members TUẦN TỰ phụ
-- thuộc group_id → 2 wave mạng). Server tự join → 1 wave. Tiết kiệm ~1 RTT.
--
-- Trả 1 jsonb object khớp shape TripBalanceData (src/services/expense.service.ts):
--   { group_id, expenses: [<expense row> + expense_splits:[...]], payments: [...],
--     members: [{id, display_name, left_at}] }
-- to_jsonb(row) sinh key snake_case y hệt PostgREST select('*') → client cast as-is.
--
-- Bảo mật: SECURITY DEFINER + gate is_member(group_id). Trip không tồn tại / đã xóa
-- HOẶC caller không phải member → trả NULL (KHỚP hành vi cũ: RLS giấu → client nhận
-- null, KHÔNG throw → không cần thêm ERROR_MAP). STABLE (read-only).
--
-- Members KHÔNG filter left_at IS NULL (khớp nhánh server cũ — ex-member có thể còn
-- balance cần hiện). Expenses/payments lọc deleted_at IS NULL, sort y query cũ
-- (expenses: date DESC, created_at DESC; payments: date DESC).

CREATE OR REPLACE FUNCTION public.get_trip_balance_data(p_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id uuid;
  v_result jsonb;
BEGIN
  SELECT t.group_id INTO v_group_id
  FROM public.trips t
  WHERE t.id = p_trip_id AND t.deleted_at IS NULL;

  -- Trip không tồn tại / đã xóa → null (khớp cũ: !tripRes.data → return null).
  IF v_group_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Gate: chỉ member của group mới đọc được (khớp cũ: RLS giấu → null cho non-member).
  IF NOT public.is_member(v_group_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'group_id', v_group_id,
    'expenses', COALESCE((
      SELECT jsonb_agg(
               to_jsonb(e) || jsonb_build_object(
                 'expense_splits',
                 COALESCE((
                   SELECT jsonb_agg(to_jsonb(s))
                   FROM public.expense_splits s
                   WHERE s.expense_id = e.id
                 ), '[]'::jsonb)
               )
               ORDER BY e.date DESC, e.created_at DESC
             )
      FROM public.expenses e
      WHERE e.trip_id = p_trip_id AND e.deleted_at IS NULL
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.date DESC)
      FROM public.payments p
      WHERE p.trip_id = p_trip_id AND p.deleted_at IS NULL
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('id', m.id, 'display_name', m.display_name, 'left_at', m.left_at)
             )
      FROM public.group_members m
      WHERE m.group_id = v_group_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trip_balance_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_balance_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_trip_balance_data(uuid) IS
  'Gom expenses(+splits)/payments/members/group_id của 1 trip trong 1 round-trip (thay 2-wave waterfall ở fetchTripBalanceData). Trả jsonb khớp TripBalanceData; NULL nếu trip không tồn tại/đã xóa hoặc caller không phải member. SECURITY DEFINER + gate is_member. Read-only, không throw.';
