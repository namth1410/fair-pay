-- clear_trip / delete_trip: xoá luôn toàn bộ audit_logs của trip đó.
--
-- Yêu cầu sản phẩm: reset (clear) hoặc xoá (delete) 1 chuyến đi thì lịch sử audit
-- của chuyến đó cũng phải biến mất (clear → History trống, chỉ còn marker trip.clear
-- do client logAction ghi lại SAU khi RPC return; delete → trip ẩn hẳn).
--
-- An toàn: chỉ audit_logs có trip_id (expense.*/payment.*/trip.*) bị xoá; mọi audit
-- cấp group/member đều trip_id IS NULL nên KHÔNG bị đụng. (Đã xác minh trên DB.)
--
-- Đi kèm migration 20260601120000 (drop trg_expense_audit/trg_payment_audit): sau khi
-- drop trigger, bulk soft-delete expenses/payments trong 2 RPC này không còn sinh audit
-- per-item — đúng ý đồ (ta xoá sạch audit của trip).

CREATE OR REPLACE FUNCTION public.clear_trip(p_trip_id uuid)
RETURNS TABLE(group_id uuid, name text, was_closed boolean, version integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Xoá toàn bộ audit của trip (chỉ trip-scoped rows; group/member có trip_id NULL).
  DELETE FROM public.audit_logs WHERE trip_id = p_trip_id;

  IF v_status = 'closed' THEN
    UPDATE public.trips
       SET status = 'open', closed_at = NULL
     WHERE id = p_trip_id;
  END IF;

  RETURN QUERY
    SELECT v_group_id, v_name, (v_status = 'closed'), t.version, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_trip(p_trip_id uuid)
RETURNS TABLE(group_id uuid, name text, version integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Xoá toàn bộ audit của trip (chỉ trip-scoped rows; group/member có trip_id NULL).
  DELETE FROM public.audit_logs WHERE trip_id = p_trip_id;

  RETURN QUERY
    SELECT v_group_id, v_name, t.version, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$function$;
