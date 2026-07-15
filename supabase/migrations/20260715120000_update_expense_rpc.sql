-- update_expense: atomic edit expense + replace splits + audit + notify trong 1 transaction.
-- P3 optimistic concurrency: client gửi p_base_version, server check mismatch → P0410 conflict.
--
-- Mô hình = create_expense (member check + trip/payer/splits validation + notify)
--           + optimistic-concurrency của update_group (version check → P0410).
--
-- Quyền: MỌI member (giống create_expense; khác delete vốn admin-only).
--
-- Caller TS truyền:
--   - p_base_version: version TRƯỚC khi sửa (đọc từ local mirror). Mismatch → P0410.
--   - p_edited_title: title notification đã format sẵn ('X đã sửa khoản chi ...').
--   - p_actor_name: display_name của caller (cho dedup title).
--   - p_splits: jsonb array [{member_id: uuid, amount: bigint}, ...] — REPLACE toàn bộ splits.
--
-- Errors:
--   - unauthorized (42501): chưa đăng nhập
--   - not_authorized (42501): caller không phải member của group
--   - expense_not_found (P0002): expense không tồn tại hoặc đã xóa → dead-letter (không retry)
--   - trip_not_found (P0002): trip không tồn tại/đã xóa
--   - trip_closed (P0001): trip đã đóng, không sửa được
--   - payer_not_in_group (P0001): paid_by không phải member active của group
--   - invalid_title / invalid_amount / invalid_splits (P0001)
--   - splits_sum_mismatch (P0001): tổng splits != amount
--   - version_conflict (P0410): p_base_version != current version → conflict modal

CREATE OR REPLACE FUNCTION public.update_expense(
  p_expense_id uuid,
  p_title text,
  p_amount bigint,
  p_category text,
  p_paid_by uuid,           -- group_members.id
  p_split_type text,
  p_splits jsonb,
  p_note text,
  p_date timestamptz,
  p_image_url text,
  p_base_version integer,
  p_edited_title text,      -- title notification đã format sẵn
  p_actor_name text,        -- cho dedup reformat
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
  -- Authentication
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Fetch current expense (SELECT cả deleted để phân biệt not-found vs version mismatch)
  SELECT e.group_id, e.trip_id, e.version, e.deleted_at, e.title, e.amount
    INTO v_group_id, v_trip_id, v_current_version, v_deleted_at, v_old_title, v_old_amount
    FROM public.expenses e
   WHERE e.id = p_expense_id;

  -- Deleted / not-found → P0002 (dead-letter, không retry vô hạn)
  IF v_group_id IS NULL OR v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: caller phải là member nhóm (mọi member sửa được)
  IF NOT public.is_member(v_group_id) THEN
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

  -- Trip chưa đóng
  SELECT t.status INTO v_trip_status
    FROM public.trips t WHERE t.id = v_trip_id AND t.deleted_at IS NULL;
  IF v_trip_status IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_trip_status = 'closed' THEN
    RAISE EXCEPTION 'trip_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Payer active member của group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
     WHERE id = p_paid_by AND group_id = v_group_id AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'payer_not_in_group' USING ERRCODE = 'P0001';
  END IF;

  -- Splits sum == amount (defense in depth, TS đã validate)
  SELECT COALESCE(SUM((s.value->>'amount')::bigint), 0)
    INTO v_splits_sum
    FROM jsonb_array_elements(p_splits) AS s;
  IF v_splits_sum <> p_amount THEN
    RAISE EXCEPTION 'splits_sum_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- Optimistic concurrency check
  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict'
      USING ERRCODE = 'P0410',
            DETAIL = format('expected version %s, current %s', p_base_version, v_current_version);
  END IF;

  -- UPDATE expense (trigger bump_version_and_updated_at tự bump version + updated_at)
  UPDATE public.expenses
     SET title = p_title,
         amount = p_amount,
         category = p_category,
         paid_by = p_paid_by,
         split_type = p_split_type,
         date = COALESCE(p_date, date),
         note = NULLIF(p_note, ''),
         image_url = p_image_url
   WHERE id = p_expense_id;

  -- Replace splits: server là source of truth cho tập splits mới
  DELETE FROM public.expense_splits WHERE expense_id = p_expense_id;
  INSERT INTO public.expense_splits (expense_id, member_id, amount)
  SELECT
    p_expense_id,
    (s.value->>'member_id')::uuid,
    (s.value->>'amount')::bigint
  FROM jsonb_array_elements(p_splits) AS s;

  -- Audit (before/after)
  PERFORM public._log_action(
    v_group_id,
    v_trip_id,
    'expense.edit',
    p_expense_id,
    jsonb_build_object('title', v_old_title, 'amount', v_old_amount),
    jsonb_build_object('title', p_title, 'amount', p_amount, 'category', p_category)
  );

  -- Notify (settings: notify_activity), dedup 10 phút
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

REVOKE ALL ON FUNCTION public.update_expense(uuid, text, bigint, text, uuid, text, jsonb, text, timestamptz, text, integer, text, text, uuid) FROM PUBLIC;
-- Supabase cấp default EXECUTE cho anon explicit → REVOKE FROM PUBLIC không gỡ. Phải REVOKE FROM anon tường minh.
REVOKE EXECUTE ON FUNCTION public.update_expense(uuid, text, bigint, text, uuid, text, jsonb, text, timestamptz, text, integer, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_expense(uuid, text, bigint, text, uuid, text, jsonb, text, timestamptz, text, integer, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_expense IS
  'Atomic: edit expense + replace splits + audit + notify. Member only (mọi member).
   Optimistic concurrency qua p_base_version. Errors: unauthorized / not_authorized (42501),
   expense_not_found / trip_not_found (P0002),
   trip_closed / payer_not_in_group / invalid_title / invalid_amount / invalid_splits / splits_sum_mismatch (P0001),
   version_conflict (P0410).';
