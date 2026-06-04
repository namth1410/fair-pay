-- ============================================================================
-- Nghiệp vụ: cho MỌI member tạo được chuyến đi (trip) — 2026-06-04
--
-- Trước đây chỉ admin tạo được trip (RLS INSERT + RPC create_trip check is_admin).
-- Đổi sang: bất kỳ thành viên nào trong nhóm cũng TẠO được trip.
--
-- PHẠM VI: chỉ thao tác TẠO. Quản lý trip (đổi tên/đóng/mở lại/reset/xoá) VẪN chỉ
-- admin — KHÔNG đụng update_trip_name/close_trip/reopen_trip/clear_trip/delete_trip
-- và RLS UPDATE trips (giữ is_admin). Member vốn đã thêm khoản chi vào trip bất kỳ
-- (expenses INSERT = is_member) nên trip do member tạo dùng được ngay.
--
-- Rate-limit trigger trips (60/user/1d theo created_by + spoof guard ở migration
-- 20260604130000) tự đúng cho member — không cần sửa.
-- ============================================================================

-- ── RLS: trips INSERT từ is_admin → is_member ─────────────────────────────────
DROP POLICY IF EXISTS "Admins can create trips" ON public.trips;
CREATE POLICY "Members can create trips"
  ON public.trips
  FOR INSERT
  TO public
  WITH CHECK (is_member(group_id));

-- ── RPC create_trip: is_admin → is_member (raise not_authorized thay vì not_admin) ──
-- Giữ nguyên mọi phần khác (SETOF, search_path, ON CONFLICT idempotent, _log_action).
CREATE OR REPLACE FUNCTION public.create_trip(
  p_id uuid,
  p_group_id uuid,
  p_name text,
  p_type text,
  p_client_request_id uuid,
  p_client_created_at timestamp with time zone
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_new_trip public.trips;
  v_inserted boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Mọi member của nhóm đều tạo được trip (trước đây chỉ admin).
  IF NOT public.is_member(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.trips (id, group_id, name, type, created_by, client_request_id)
  VALUES (p_id, p_group_id, p_name, p_type, v_actor, p_client_request_id)
  ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_new_trip;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT * INTO v_new_trip
      FROM public.trips
     WHERE client_request_id = p_client_request_id;
    RETURN NEXT v_new_trip;
    RETURN;
  END IF;

  PERFORM public._log_action(
    p_group_id,
    v_new_trip.id,
    'trip.create',
    v_new_trip.id,
    NULL,
    jsonb_build_object('name', p_name, 'type', p_type)
  );

  RETURN NEXT v_new_trip;
  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.create_trip(uuid, uuid, text, text, uuid, timestamptz) IS
  'Tạo trip (P1 append-only, idempotent qua client_request_id). MỌI member tạo được (is_member). Quản lý trip vẫn chỉ admin. Errcodes: 42501 (not_authenticated/not_authorized), P0001 (invalid_title).';
