-- Trip lifecycle: clear (reset) và delete trong 1 transaction atomic.
-- Pattern: SECURITY DEFINER + explicit is_admin check + SET search_path tránh search_path attack.
-- Trả về `name` để caller-side log audit + notify với tên cũ.

CREATE OR REPLACE FUNCTION public.clear_trip(p_trip_id uuid)
RETURNS TABLE(group_id uuid, name text, was_closed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id uuid;
  v_name text;
  v_status text;
BEGIN
  SELECT t.group_id, t.name, t.status
    INTO v_group_id, v_name, v_status
    FROM public.trips t
   WHERE t.id = p_trip_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.expenses
     SET deleted_at = now()
   WHERE trip_id = p_trip_id AND deleted_at IS NULL;

  UPDATE public.payments
     SET deleted_at = now()
   WHERE trip_id = p_trip_id AND deleted_at IS NULL;

  IF v_status = 'closed' THEN
    UPDATE public.trips
       SET status = 'open', closed_at = NULL
     WHERE id = p_trip_id;
  END IF;

  RETURN QUERY SELECT v_group_id, v_name, (v_status = 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_trip(p_trip_id uuid)
RETURNS TABLE(group_id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id uuid;
  v_name text;
BEGIN
  SELECT t.group_id, t.name
    INTO v_group_id, v_name
    FROM public.trips t
   WHERE t.id = p_trip_id AND t.deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.trips
     SET deleted_at = now()
   WHERE id = p_trip_id AND deleted_at IS NULL;

  UPDATE public.expenses
     SET deleted_at = now()
   WHERE trip_id = p_trip_id AND deleted_at IS NULL;

  UPDATE public.payments
     SET deleted_at = now()
   WHERE trip_id = p_trip_id AND deleted_at IS NULL;

  RETURN QUERY SELECT v_group_id, v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_trip(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.clear_trip(uuid) IS
  'Atomic: soft-delete all expenses & payments của trip, reopen trip nếu đang closed. Admin only. Errors: trip_not_found (P0002), not_admin (42501).';
COMMENT ON FUNCTION public.delete_trip(uuid) IS
  'Atomic: soft-delete trip + cascade expenses & payments. Admin only. Errors: trip_not_found (P0002), not_admin (42501).';
