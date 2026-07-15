-- Fix: update_expense raise 42702 "column reference \"id\" is ambiguous".
-- Nguyên nhân: RETURNS TABLE(id, ..., date, ...) tạo OUT param trùng tên cột bảng.
-- Trong body, `WHERE id = p_paid_by` (payer check) + `date = COALESCE(p_date, date)`
-- (UPDATE) dùng tên trần → Postgres không biết là cột hay OUT param.
-- (create_expense không dính vì dùng RETURNS SETOF, không có OUT param cùng tên.)
--
-- Fix: `#variable_conflict use_column` → tên trần trong query ưu tiên hiểu là CỘT.
-- An toàn: mọi OUT param chỉ được gán qua RETURN QUERY (đã qualify `e.`), body không
-- bao giờ đọc OUT param như biến.

CREATE OR REPLACE FUNCTION public.update_expense(
  p_expense_id uuid,
  p_title text,
  p_amount bigint,
  p_category text,
  p_paid_by uuid,
  p_split_type text,
  p_splits jsonb,
  p_note text,
  p_date timestamptz,
  p_image_url text,
  p_base_version integer,
  p_edited_title text,
  p_actor_name text,
  p_client_request_id uuid
)
RETURNS TABLE(
  id uuid, version integer, title text, amount bigint, category text,
  paid_by uuid, split_type text, date timestamptz, note text,
  image_url text, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_trip_id uuid;
  v_current_version integer;
  v_deleted_at timestamptz;
  v_trip_status text;
  v_splits_sum bigint;
  v_recipients uuid[];
  v_old_title text;
  v_old_amount bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT e.group_id, e.trip_id, e.version, e.deleted_at, e.title, e.amount
    INTO v_group_id, v_trip_id, v_current_version, v_deleted_at, v_old_title, v_old_amount
    FROM public.expenses e
   WHERE e.id = p_expense_id;

  IF v_group_id IS NULL OR v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_member(v_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_splits IS NULL OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'invalid_splits' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.status INTO v_trip_status
    FROM public.trips t WHERE t.id = v_trip_id AND t.deleted_at IS NULL;
  IF v_trip_status IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_trip_status = 'closed' THEN
    RAISE EXCEPTION 'trip_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Payer active member (alias gm + qualify để tránh phụ thuộc use_column)
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members gm
     WHERE gm.id = p_paid_by AND gm.group_id = v_group_id AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'payer_not_in_group' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM((s.value->>'amount')::bigint), 0)
    INTO v_splits_sum
    FROM jsonb_array_elements(p_splits) AS s;
  IF v_splits_sum <> p_amount THEN
    RAISE EXCEPTION 'splits_sum_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict'
      USING ERRCODE = 'P0410',
            DETAIL = format('expected version %s, current %s', p_base_version, v_current_version);
  END IF;

  UPDATE public.expenses e
     SET title = p_title,
         amount = p_amount,
         category = p_category,
         paid_by = p_paid_by,
         split_type = p_split_type,
         date = COALESCE(p_date, e.date),
         note = NULLIF(p_note, ''),
         image_url = p_image_url
   WHERE e.id = p_expense_id;

  DELETE FROM public.expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO public.expense_splits (expense_id, member_id, amount)
  SELECT
    p_expense_id,
    (s.value->>'member_id')::uuid,
    (s.value->>'amount')::bigint
  FROM jsonb_array_elements(p_splits) AS s;

  PERFORM public._log_action(
    v_group_id,
    v_trip_id,
    'expense.edit',
    p_expense_id,
    jsonb_build_object('title', v_old_title, 'amount', v_old_amount),
    jsonb_build_object('title', p_title, 'amount', p_amount, 'category', p_category)
  );

  v_recipients := public._get_group_recipients(v_group_id, 'notify_activity', v_actor);
  IF array_length(v_recipients, 1) IS NOT NULL THEN
    PERFORM public._create_notifications_dedup(
      v_recipients,
      'expense.edited',
      v_actor,
      v_group_id,
      v_trip_id,
      p_edited_title,
      p_actor_name,
      NULL,
      jsonb_build_object(
        'target_id', p_expense_id::text,
        'expense_title', p_title,
        'amount', p_amount
      )
    );
  END IF;

  RETURN QUERY
    SELECT e.id, e.version, e.title, e.amount, e.category,
           e.paid_by, e.split_type, e.date, e.note, e.image_url, e.updated_at
      FROM public.expenses e WHERE e.id = p_expense_id;
END;
$$;
