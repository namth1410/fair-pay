-- create_expense: atomic insert expense + splits + audit + notify trong 1 transaction.
-- Thay thế logic createExpense() ở src/services/expense.service.ts để đảm bảo BR-02
-- (không bao giờ có expense thiếu splits) ngay cả khi network drop giữa chừng.
--
-- Caller TS truyền:
--   - p_initial_title: title notification đã format sẵn (kèm formatVND money).
--     RPC chỉ reformat khi dedup count>1 qua _format_dedup_title.
--   - p_actor_name: display_name của caller (dùng cho dedup title).
--   - p_splits: jsonb array [{member_id: uuid, amount: bigint}, ...]
--
-- Errors:
--   - not_authorized (42501): caller không phải member của group
--   - trip_not_found (P0002): trip không tồn tại hoặc đã xóa
--   - trip_not_in_group (P0001): trip không thuộc p_group_id
--   - trip_closed (P0001): trip đã đóng, không thêm được expense
--   - payer_not_in_group (P0001): paid_by không phải member của group
--   - invalid_title (P0001): title rỗng
--   - invalid_amount (P0001): amount <= 0
--   - splits_sum_mismatch (P0001): tổng splits != amount

CREATE OR REPLACE FUNCTION public.create_expense(
  p_id uuid,                -- nullable: client có thể gen UUID trước (cho image upload)
  p_trip_id uuid,
  p_group_id uuid,
  p_title text,
  p_amount bigint,
  p_category text,
  p_paid_by uuid,           -- group_members.id
  p_split_type text,
  p_splits jsonb,
  p_note text,
  p_date timestamptz,
  p_image_url text,
  p_initial_title text,     -- title notification đã format sẵn
  p_actor_name text         -- cho dedup reformat
)
RETURNS SETOF public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_trip_group uuid;
  v_trip_status text;
  v_splits_sum bigint;
  v_recipients uuid[];
  v_new_expense public.expenses;
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
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_splits IS NULL OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'invalid_splits' USING ERRCODE = 'P0001';
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

  -- Verify paid_by là member active của group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
     WHERE id = p_paid_by AND group_id = p_group_id AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'payer_not_in_group' USING ERRCODE = 'P0001';
  END IF;

  -- Verify splits sum == amount (defense in depth, TS đã validate)
  SELECT COALESCE(SUM((s.value->>'amount')::bigint), 0)
    INTO v_splits_sum
    FROM jsonb_array_elements(p_splits) AS s;

  IF v_splits_sum <> p_amount THEN
    RAISE EXCEPTION 'splits_sum_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- INSERT expense (dùng p_id nếu non-null)
  INSERT INTO public.expenses (
    id, trip_id, group_id, title, amount, category,
    paid_by, split_type, date, note, image_url, created_by
  )
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
    p_trip_id, p_group_id, p_title, p_amount, p_category,
    p_paid_by, p_split_type,
    COALESCE(p_date, now()),
    NULLIF(p_note, ''),
    p_image_url,
    v_actor
  )
  RETURNING * INTO v_new_expense;

  -- INSERT splits (parse từ jsonb)
  INSERT INTO public.expense_splits (expense_id, member_id, amount)
  SELECT
    v_new_expense.id,
    (s.value->>'member_id')::uuid,
    (s.value->>'amount')::bigint
  FROM jsonb_array_elements(p_splits) AS s;

  -- Audit log (internal helper — actor = auth_user_id())
  PERFORM public._log_action(
    p_group_id,
    p_trip_id,
    'expense.create',
    v_new_expense.id,
    NULL,
    jsonb_build_object('title', p_title, 'amount', p_amount, 'category', p_category)
  );

  -- Resolve recipients + fan-out notification (settings: notify_activity)
  v_recipients := public._get_group_recipients(p_group_id, 'notify_activity', v_actor);

  IF array_length(v_recipients, 1) IS NOT NULL THEN
    PERFORM public._create_notifications_dedup(
      v_recipients,
      'expense.created',
      v_actor,
      p_group_id,
      p_trip_id,
      p_initial_title,
      p_actor_name,
      NULL,
      jsonb_build_object(
        'target_id', v_new_expense.id::text,
        'expense_title', p_title,
        'amount', p_amount
      )
    );
  END IF;

  RETURN NEXT v_new_expense;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense(uuid, uuid, uuid, text, bigint, text, uuid, text, jsonb, text, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_expense(uuid, uuid, uuid, text, bigint, text, uuid, text, jsonb, text, timestamptz, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_expense IS
  'Atomic: insert expense + splits + audit + notify trong 1 transaction. Member only.
   Errors: not_authorized (42501), trip_not_found (P0002),
           trip_not_in_group / trip_closed / payer_not_in_group / invalid_title / invalid_amount / invalid_splits / splits_sum_mismatch (P0001).';
