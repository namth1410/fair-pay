-- ============================================================================
-- Fix: update_preset ném 42804 "structure of query does not match function
-- result type" mỗi khi sửa preset (online tại preset.service.ts updatePreset +
-- offline replay tại pushDispatcher case UPDATE_PRESET).
-- ============================================================================
-- Nguyên nhân: RETURNS TABLE khai báo OUT column `amount integer` nhưng cột
--   `expense_presets.amount` thực tế là `bigint` (đồng bộ expenses/payments.amount).
--   RETURN QUERY select cột bigint vào OUT column integer → Postgres strict-check
--   kiểu → 42804. (Bản thân việc lỗi xảy ra đã chứng minh cột KHÔNG phải integer.)
--
-- Fix: OUT column `amount integer` → `amount bigint` + cast tường minh
--   `p.amount::bigint` ở RETURN QUERY (an toàn cho cả int4 lẫn int8). Đồng thời
--   chuẩn hóa input param `p_amount` integer → bigint cho nhất quán với
--   create_expense/create_payment.
--
-- Đổi return type → KHÔNG dùng CREATE OR REPLACE được ("cannot change return
--   type") → DROP + CREATE (pattern như 20260528150000_extend_returns_for_writeback).
--   DROP theo signature CŨ (p_amount integer); REVOKE/GRANT theo signature MỚI
--   (p_amount bigint).
--
-- Body giữ NGUYÊN logic authz (v_owner) + version check P0410 + UPDATE của bản
--   20260526210000_fix_p3_rpcs_variable_conflict.sql.
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_preset(
  uuid, text, integer, text, uuid, uuid, text, jsonb, integer, uuid
);

CREATE FUNCTION public.update_preset(
  p_preset_id uuid,
  p_title text,
  p_amount bigint,
  p_category text,
  p_trip_id uuid,
  p_paid_by_member_id uuid,
  p_split_type text,
  p_splits_data jsonb,
  p_base_version integer,
  p_client_request_id uuid
)
RETURNS TABLE(
  id uuid, version integer, title text, amount bigint, category text,
  trip_id uuid, paid_by_member_id uuid, split_type text, splits_data jsonb,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := public.auth_user_id();
  v_owner uuid;
  v_current_version integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.user_id, p.version
    INTO v_owner, v_current_version
    FROM public.expense_presets p
   WHERE p.id = p_preset_id AND p.deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'preset_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_actor THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.expense_presets
     SET title = p_title,
         amount = p_amount,
         category = p_category,
         trip_id = p_trip_id,
         paid_by_member_id = p_paid_by_member_id,
         split_type = p_split_type,
         splits_data = p_splits_data
   WHERE id = p_preset_id;

  RETURN QUERY
    SELECT p.id, p.version, p.title, p.amount::bigint, p.category,
           p.trip_id, p.paid_by_member_id, p.split_type, p.splits_data,
           p.updated_at
      FROM public.expense_presets p WHERE p.id = p_preset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_preset(
  uuid, text, bigint, text, uuid, uuid, text, jsonb, integer, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_preset(
  uuid, text, bigint, text, uuid, uuid, text, jsonb, integer, uuid
) TO authenticated;

COMMENT ON FUNCTION public.update_preset IS
  'P3 update preset (optimistic concurrency). RETURNS amount bigint khớp cột expense_presets.amount (fix 42804). Body giữ nguyên authz + version check P0410.';
