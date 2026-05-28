-- ============================================================================
-- Migration: Extend RETURNS của 4 RPC để client write-back đủ version + updated_at.
-- ============================================================================
-- Vấn đề: 4 RPC `delete_payment`, `delete_expense`, `clear_trip`, `delete_trip`
-- hiện RETURNS thiếu `version` + `updated_at`. Sau khi server UPDATE → trigger
-- `bump_version_and_updated_at` bump 2 cột này → client không write-back được
-- → lần update kế (vd updateTripName P3 sau clearTrip) gửi `p_base_version`
-- stale → throw `version_conflict` (P0410).
--
-- Pattern reference: [update_user_settings] RETURNS TABLE(id, version, settings,
-- updated_at) — đầy đủ để client mirror.
--
-- Lưu ý kỹ thuật: thay đổi RETURNS TABLE shape yêu cầu DROP + CREATE (CREATE OR
-- REPLACE fail với "cannot change return type"). delete_expense return jsonb
-- nên dùng CREATE OR REPLACE thường (shape của jsonb không bị Postgres lock).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. delete_payment — RETURNS(id, deleted_at) → RETURNS(id, deleted_at, version, updated_at)
-- ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_payment(uuid, uuid, timestamptz);

CREATE FUNCTION public.delete_payment(
  p_payment_id uuid,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, deleted_at timestamptz, version integer, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_trip_id uuid;
  v_recorded_by uuid;
  v_current_deleted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.group_id, p.trip_id, p.recorded_by, p.deleted_at
    INTO v_group_id, v_trip_id, v_recorded_by, v_current_deleted_at
    FROM public.payments p WHERE p.id = p_payment_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_recorded_by <> v_actor AND NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.payments
     SET deleted_at = COALESCE(deleted_at, now())
   WHERE id = p_payment_id;

  IF v_current_deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (group_id, trip_id, action, actor_id, target_id, before_data, after_data, client_created_at)
    VALUES (v_group_id, v_trip_id, 'payment.delete', v_actor, p_payment_id, NULL, NULL, p_client_created_at);
  END IF;

  RETURN QUERY
    SELECT p.id, p.deleted_at, p.version, p.updated_at
      FROM public.payments p WHERE p.id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payment(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_payment(uuid, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.delete_payment IS
  'Soft-delete payment. Returns id, deleted_at, version, updated_at để client mirror local SQLite (tránh stale base_version cho lần update kế).';

-- ──────────────────────────────────────────────────────────────────────
-- 2. delete_expense — RETURNS jsonb → vẫn jsonb, thêm version + updated_at fields
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_expense(
  p_expense_id uuid,
  p_actor_name text,
  p_client_request_id uuid,
  p_client_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_expense public.expenses%ROWTYPE;
  v_trip_status text;
  v_was_deleted boolean;
  v_recipients uuid[];
  v_title text;
  v_new_version integer;
  v_new_updated_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_expense
    FROM public.expenses
   WHERE id = p_expense_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_expense.group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_trip_status
    FROM public.trips
   WHERE id = v_expense.trip_id;

  IF v_trip_status = 'closed' THEN
    RAISE EXCEPTION 'cannot_modify_closed_trip' USING ERRCODE = 'P0001';
  END IF;

  v_was_deleted := v_expense.deleted_at IS NOT NULL;

  UPDATE public.expenses
     SET deleted_at = p_client_created_at
   WHERE id = p_expense_id
     AND deleted_at IS NULL;

  IF NOT v_was_deleted THEN
    PERFORM public._log_action(
      v_expense.group_id,
      v_expense.trip_id,
      'expense.delete',
      p_expense_id,
      jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount),
      NULL
    );

    v_recipients := public._get_group_recipients(
      v_expense.group_id,
      'notify_activity',
      v_actor
    );

    IF array_length(v_recipients, 1) IS NOT NULL THEN
      v_title := COALESCE(p_actor_name, 'Ai đó') || ' đã xóa khoản chi ' || v_expense.title;
      PERFORM public._create_notifications_dedup(
        v_recipients,
        'expense.deleted',
        v_actor,
        v_expense.group_id,
        v_expense.trip_id,
        v_title,
        COALESCE(p_actor_name, 'Ai đó'),
        NULL,
        jsonb_build_object(
          'target_id', p_expense_id::text,
          'expense_title', v_expense.title,
          'amount', v_expense.amount
        )
      );
    END IF;
  END IF;

  -- Fetch fresh version + updated_at sau UPDATE (trigger đã bump nếu deleted_at được set).
  SELECT version, updated_at INTO v_new_version, v_new_updated_at
    FROM public.expenses WHERE id = p_expense_id;

  RETURN jsonb_build_object(
    'expense_id', p_expense_id,
    'was_deleted', v_was_deleted,
    'group_id', v_expense.group_id,
    'trip_id', v_expense.trip_id,
    'version', v_new_version,
    'updated_at', v_new_updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.delete_expense IS
  'Soft-delete expense atomic + audit + notify. Returns jsonb {expense_id, was_deleted, group_id, trip_id, version, updated_at} — version + updated_at để client mirror tránh stale.';

-- ──────────────────────────────────────────────────────────────────────
-- 3. clear_trip — RETURNS(group_id, name, was_closed) → thêm version, updated_at
-- ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.clear_trip(uuid);

CREATE FUNCTION public.clear_trip(p_trip_id uuid)
RETURNS TABLE(group_id uuid, name text, was_closed boolean, version integer, updated_at timestamptz)
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

  RETURN QUERY
    SELECT v_group_id, v_name, (v_status = 'closed'), t.version, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.clear_trip IS
  'Clear trip: cascade soft-delete expenses + payments. Reopen nếu trip closed. Returns {group_id, name, was_closed, version, updated_at} — version+updated_at để client mirror trip mirror.';

-- ──────────────────────────────────────────────────────────────────────
-- 4. delete_trip — RETURNS(group_id, name) → thêm version, updated_at
-- ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_trip(uuid);

CREATE FUNCTION public.delete_trip(p_trip_id uuid)
RETURNS TABLE(group_id uuid, name text, version integer, updated_at timestamptz)
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

  RETURN QUERY
    SELECT v_group_id, v_name, t.version, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_trip IS
  'Soft-delete trip + cascade expenses + payments. Returns {group_id, name, version, updated_at} — version+updated_at để client mirror.';
