-- Atomic audit + notify cho 4 op offline-first: create_trip, add_virtual_member,
-- delete_expense, remove_member. Trước migration này, 4 op gọi raw INSERT/UPDATE
-- ở pushDispatcher → khi user offline rồi sync, client-side logAction() không
-- bao giờ chạy → audit log miss → tab Lịch sử không hiện entry tương ứng.
--
-- Pattern: SECURITY DEFINER + SET search_path + explicit is_admin() check +
-- REVOKE PUBLIC + GRANT authenticated + COMMENT liệt kê errors. Actor luôn =
-- auth_user_id() server-side (chống spoof).
--
-- Idempotency:
--   P1 (create_trip, add_virtual_member): INSERT ... ON CONFLICT (client_request_id)
--     DO NOTHING + check FOUND → audit chỉ log nếu insert thật (không log replay).
--   P2 (delete_expense, remove_member): đọc state cũ trước (deleted_at/left_at),
--     UPDATE COALESCE, log audit + notify chỉ khi flip NULL → timestamp.

-- ──────────────────────────────────────────────────────────────────────────────
-- create_trip — P1 append-only. Admin only. Audit `trip.create`.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_trip(
  p_id uuid,
  p_group_id uuid,
  p_name text,
  p_type text,
  p_client_request_id uuid,
  p_client_created_at timestamptz
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_new_trip public.trips;
  v_inserted boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent INSERT: replay queue → ON CONFLICT (client_request_id) DO NOTHING.
  -- WHERE clause khớp partial unique index idx_trips_client_request_id.
  INSERT INTO public.trips (id, group_id, name, type, created_by, client_request_id)
  VALUES (p_id, p_group_id, p_name, p_type, v_actor, p_client_request_id)
  ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_new_trip;

  v_inserted := FOUND;

  -- Replay duplicate → SELECT existing row, KHÔNG log audit lần 2.
  IF NOT v_inserted THEN
    SELECT * INTO v_new_trip
      FROM public.trips
     WHERE client_request_id = p_client_request_id;
    RETURN NEXT v_new_trip;
    RETURN;
  END IF;

  -- Audit (chỉ lần đầu tạo thật).
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
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- add_virtual_member — P1 append-only. Admin only. Audit `member.virtual_add`.
-- Không notify (member ảo không có user_id).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_virtual_member(
  p_id uuid,
  p_group_id uuid,
  p_display_name text,
  p_client_request_id uuid,
  p_client_created_at timestamptz
)
RETURNS SETOF public.group_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_new_member public.group_members;
  v_inserted boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_display_name IS NULL OR length(btrim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.group_members (
    id, group_id, user_id, display_name, role, is_virtual, client_request_id
  )
  VALUES (
    p_id, p_group_id, NULL, p_display_name, 'member', true, p_client_request_id
  )
  ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_new_member;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT * INTO v_new_member
      FROM public.group_members
     WHERE client_request_id = p_client_request_id;
    RETURN NEXT v_new_member;
    RETURN;
  END IF;

  PERFORM public._log_action(
    p_group_id,
    NULL,
    'member.virtual_add',
    v_new_member.id,
    NULL,
    jsonb_build_object('display_name', p_display_name, 'is_virtual', true)
  );

  RETURN NEXT v_new_member;
  RETURN;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- delete_expense — P2 soft-delete idempotent. Admin only. Audit `expense.delete`
-- + notify `expense.deleted` (dedup window 10 min). Chỉ chạy khi flip NULL→ts.
-- ──────────────────────────────────────────────────────────────────────────────
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Lock + lookup expense
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

  -- Check trip không bị closed
  SELECT status INTO v_trip_status
    FROM public.trips
   WHERE id = v_expense.trip_id;

  IF v_trip_status = 'closed' THEN
    RAISE EXCEPTION 'cannot_modify_closed_trip' USING ERRCODE = 'P0001';
  END IF;

  v_was_deleted := v_expense.deleted_at IS NOT NULL;

  -- Idempotent soft-delete: replay 2nd time → no-op vì WHERE deleted_at IS NULL
  UPDATE public.expenses
     SET deleted_at = p_client_created_at
   WHERE id = p_expense_id
     AND deleted_at IS NULL;

  -- Chỉ log audit + notify lần đầu thật sự xóa
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
      -- Title format đồng bộ formatNotificationTitle 'expense.deleted' (no money).
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

  RETURN jsonb_build_object(
    'expense_id', p_expense_id,
    'was_deleted', v_was_deleted,
    'group_id', v_expense.group_id,
    'trip_id', v_expense.trip_id
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- remove_member — P2 soft-remove idempotent. Admin only. Audit `member.removed`.
-- Chặn xóa admin (invariant 1-admin). Không notify (out of scope plan này).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_member(
  p_member_id uuid,
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
  v_member public.group_members%ROWTYPE;
  v_was_removed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
    FROM public.group_members
   WHERE id = p_member_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_member.group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF v_member.role = 'admin' THEN
    RAISE EXCEPTION 'cannot_remove_admin' USING ERRCODE = 'P0001';
  END IF;

  v_was_removed := v_member.left_at IS NOT NULL;

  UPDATE public.group_members
     SET left_at = p_client_created_at
   WHERE id = p_member_id
     AND left_at IS NULL;

  IF NOT v_was_removed THEN
    PERFORM public._log_action(
      v_member.group_id,
      NULL,
      'member.removed',
      p_member_id,
      jsonb_build_object(
        'display_name', v_member.display_name,
        'role', v_member.role,
        'is_virtual', v_member.is_virtual
      ),
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'was_removed', v_was_removed,
    'group_id', v_member.group_id
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Grants
-- ──────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_trip(uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_virtual_member(uuid, uuid, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_expense(uuid, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_member(uuid, uuid, timestamptz) FROM PUBLIC;

-- Supabase tự GRANT EXECUTE cho anon sau CREATE FUNCTION → REVOKE explicit để chặn.
REVOKE EXECUTE ON FUNCTION public.create_trip(uuid, uuid, text, text, uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_virtual_member(uuid, uuid, text, uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_expense(uuid, text, uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_member(uuid, uuid, timestamptz) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_trip(uuid, uuid, text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_virtual_member(uuid, uuid, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense(uuid, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.create_trip(uuid, uuid, text, text, uuid, timestamptz) IS
  'Atomic: insert trip + audit. Idempotent qua client_request_id UNIQUE. Admin only.
   Errors: not_authenticated / not_admin (42501), invalid_title (P0001).';
COMMENT ON FUNCTION public.add_virtual_member(uuid, uuid, text, uuid, timestamptz) IS
  'Atomic: insert virtual member + audit. Idempotent qua client_request_id UNIQUE. Admin only.
   Errors: not_authenticated / not_admin (42501), invalid_title (P0001).';
COMMENT ON FUNCTION public.delete_expense(uuid, text, uuid, timestamptz) IS
  'Atomic: soft-delete expense + audit + notify expense.deleted (dedup 10min). Idempotent
   qua check was_deleted — replay không log duplicate audit. Admin only.
   Errors: not_authenticated / not_admin (42501), expense_not_found (P0002),
           cannot_modify_closed_trip (P0001).';
COMMENT ON FUNCTION public.remove_member(uuid, uuid, timestamptz) IS
  'Atomic: soft-remove member + audit. Idempotent qua check was_removed. Admin only.
   Không cho xóa admin (invariant 1-admin / group). Không notify.
   Errors: not_authenticated / not_admin (42501), member_not_found (P0002),
           cannot_remove_admin (P0001).';
