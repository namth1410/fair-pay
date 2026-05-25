-- create_payment: atomic insert payment + audit + notify (mirror create_expense pattern).
--
-- Bug context: trước đây client-side làm INSERT + Promise.all([logAction, notifyPaymentRecorded]),
-- KHÔNG atomic và KHÔNG replay được khi dispatcher push offline (CODE_REVIEW B-2b).
-- Đồng thời cột `payments.recorded_by` là NOT NULL — dispatcher INSERT trước đây thiếu field
-- nên replay fail với 23502 not_null_violation → queue item retry → dead → mất data.
--
-- Notification fan-out chỉ 2 recipient (mirror notifyPaymentRecorded TS):
--   - to_user → 'payment.received' với title "X đã trả bạn N"
--   - from_user (nếu khác actor) → 'payment.recorded' với title "actor ghi nhận X → Y trả N"
-- Loại virtual + actor + user tắt notify_payment.

CREATE OR REPLACE FUNCTION public.create_payment(
  p_id uuid,
  p_trip_id uuid,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_amount bigint,
  p_note text,
  p_date timestamptz,
  p_client_request_id uuid,
  p_title_for_payer text,     -- payment.recorded title (cho from_user)
  p_title_for_receiver text,  -- payment.received title (cho to_user)
  p_actor_name text
)
RETURNS SETOF public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_trip_group uuid;
  v_trip_status text;
  v_from_user uuid;
  v_to_user uuid;
  v_from_virtual boolean;
  v_to_virtual boolean;
  v_new public.payments;
  v_data jsonb;
BEGIN
  -- Authentication
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Authorization: caller phải là member nhóm
  IF NOT public.is_member(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Validate basic fields
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_from_member_id = p_to_member_id THEN
    RAISE EXCEPTION 'same_member' USING ERRCODE = 'P0001';
  END IF;

  -- Cấm future date (tolerance 1 phút clock skew — mirror create_expense)
  IF p_date IS NOT NULL AND p_date > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'invalid_date_future' USING ERRCODE = 'P0001';
  END IF;

  -- Verify trip thuộc đúng group + chưa đóng
  SELECT t.group_id, t.status
    INTO v_trip_group, v_trip_status
    FROM public.trips t
   WHERE t.id = p_trip_id AND t.deleted_at IS NULL;

  IF v_trip_group IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_trip_group <> p_group_id THEN
    RAISE EXCEPTION 'trip_not_in_group' USING ERRCODE = 'P0001';
  END IF;
  IF v_trip_status = 'closed' THEN
    RAISE EXCEPTION 'trip_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Verify cả from + to là member active của group; capture user_id + is_virtual để fan-out
  SELECT gm.user_id, COALESCE(gm.is_virtual, false)
    INTO v_from_user, v_from_virtual
    FROM public.group_members gm
   WHERE gm.id = p_from_member_id
     AND gm.group_id = p_group_id
     AND gm.left_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_in_group' USING ERRCODE = 'P0001';
  END IF;

  SELECT gm.user_id, COALESCE(gm.is_virtual, false)
    INTO v_to_user, v_to_virtual
    FROM public.group_members gm
   WHERE gm.id = p_to_member_id
     AND gm.group_id = p_group_id
     AND gm.left_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_in_group' USING ERRCODE = 'P0001';
  END IF;

  -- INSERT payment (recorded_by := v_actor; dùng p_id nếu non-null cho client-gen UUID)
  INSERT INTO public.payments (
    id, trip_id, group_id, from_member_id, to_member_id,
    amount, note, recorded_by, date, client_request_id
  )
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
    p_trip_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount, NULLIF(p_note, ''), v_actor,
    COALESCE(p_date, now()),
    p_client_request_id
  )
  RETURNING * INTO v_new;

  -- Audit
  PERFORM public._log_action(
    p_group_id,
    p_trip_id,
    'payment.create',
    v_new.id,
    NULL,
    jsonb_build_object(
      'from_member_id', p_from_member_id,
      'to_member_id', p_to_member_id,
      'amount', p_amount
    )
  );

  v_data := jsonb_build_object(
    'target_id', v_new.id::text,
    'from_member_id', p_from_member_id::text,
    'to_member_id', p_to_member_id::text,
    'amount', p_amount
  );

  -- Notify receiver (to_user) — 'payment.received'
  IF v_to_user IS NOT NULL
     AND NOT v_to_virtual
     AND v_to_user <> v_actor
     AND EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.id = v_to_user
          AND COALESCE((u.settings->>'notify_payment')::boolean, true) = true
     )
  THEN
    PERFORM public._create_notifications_dedup(
      ARRAY[v_to_user],
      'payment.received',
      v_actor,
      p_group_id,
      p_trip_id,
      p_title_for_receiver,
      p_actor_name,
      NULL,
      v_data
    );
  END IF;

  -- Notify payer (from_user) — 'payment.recorded' — chỉ khi không phải actor
  IF v_from_user IS NOT NULL
     AND NOT v_from_virtual
     AND v_from_user <> v_actor
     AND EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.id = v_from_user
          AND COALESCE((u.settings->>'notify_payment')::boolean, true) = true
     )
  THEN
    PERFORM public._create_notifications_dedup(
      ARRAY[v_from_user],
      'payment.recorded',
      v_actor,
      p_group_id,
      p_trip_id,
      p_title_for_payer,
      p_actor_name,
      NULL,
      v_data
    );
  END IF;

  RETURN NEXT v_new;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payment(
  uuid, uuid, uuid, uuid, uuid, bigint, text, timestamptz, uuid, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_payment(
  uuid, uuid, uuid, uuid, uuid, bigint, text, timestamptz, uuid, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.create_payment IS
  'Atomic: insert payment + audit + notify (payment.recorded cho payer, payment.received cho receiver) trong 1 transaction. Member only.
   Errors: not_authenticated (42501), not_authorized (42501),
           trip_not_found (P0002),
           trip_not_in_group / trip_closed / invalid_amount / same_member /
           member_not_in_group / invalid_date_future (P0001).';
