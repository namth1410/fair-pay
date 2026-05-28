-- ============================================================================
-- Migration: Restore validation + whitelist + merge logic cho update_user_settings.
-- ============================================================================
-- Bug fix:
--   20260526210000_fix_p3_rpcs_variable_conflict.sql dùng CREATE OR REPLACE để
--   thêm directive `#variable_conflict use_column` cho 9 P3 RPC, nhưng body của
--   update_user_settings đã regress về phiên bản trước 20260523130000:
--     UPDATE public.users SET settings = p_settings WHERE id = v_actor;
--   Mất 3 thứ quan trọng so với migration validation:
--     1. Merge `current || patch` — client gửi PATCH 1 key (vd {dark_mode:'dark'})
--        thì server overwrite toàn bộ jsonb → 7 key còn lại biến mất khỏi DB.
--        Cold boot / pull từ thiết bị khác / cross-device sync sẽ thấy settings
--        chỉ còn 1 key → DEFAULT_SETTINGS merge client-side silently reset 7
--        toggle còn lại về default.
--     2. Whitelist 8 key + validate type — user authenticated có thể gọi RPC
--        qua PostgREST với jsonb tuỳ ý (vd {evil_field: 'xss'}, dark_mode='hack',
--        notify_smart='not-a-bool').
--     3. Reject NULL p_base_updated_at — client bug pass NULL → IF NULL > ts =
--        NULL → IF skip → silent overwrite không check LWW.
--
-- Fix: restore body từ 20260523130000_validate_user_settings_shape.sql, GIỮ
--   directive `#variable_conflict use_column` từ 20260526210000.
--
-- KHÔNG cần re-run cleanup block (dòng 137-181 của 20260523130000) vì đã apply
--   trước đó + idempotent — bỏ qua để migration này gọn.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_user_settings(
  p_settings jsonb,
  p_base_updated_at timestamptz,
  p_client_request_id uuid
)
RETURNS TABLE(id uuid, version integer, settings jsonb, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := public.auth_user_id();
  v_current_settings jsonb;
  v_current_updated_at timestamptz;
  v_validated jsonb := '{}'::jsonb;
  v_dark_mode text;
  v_bool_key text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- I14 combo: reject NULL base → tránh silent overwrite khi client bug.
  IF p_base_updated_at IS NULL THEN
    RAISE EXCEPTION 'invalid_base_updated_at' USING ERRCODE = '22023';
  END IF;

  -- I7: reject non-object payload (jsonb scalar/array/null đều fail).
  IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_settings_shape' USING ERRCODE = '22023',
      DETAIL = format('expected jsonb object, got %s', jsonb_typeof(p_settings));
  END IF;

  SELECT u.settings, u.updated_at
    INTO v_current_settings, v_current_updated_at
    FROM public.users u WHERE u.id = v_actor;

  IF v_current_updated_at IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- LWW conflict (tolerance 1ms cho clock skew microsecond).
  IF v_current_updated_at > p_base_updated_at + interval '1 millisecond' THEN
    RAISE EXCEPTION 'lww_stale' USING ERRCODE = 'P0410',
      DETAIL = format('server updated_at %s > client base %s', v_current_updated_at, p_base_updated_at);
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- Whitelist validation
  -- ──────────────────────────────────────────────────────────────────────

  -- dark_mode: enum
  IF p_settings ? 'dark_mode' THEN
    v_dark_mode := p_settings->>'dark_mode';
    IF v_dark_mode NOT IN ('system', 'light', 'dark') THEN
      RAISE EXCEPTION 'invalid_dark_mode' USING ERRCODE = '22023',
        DETAIL = format('expected system|light|dark, got %s', v_dark_mode);
    END IF;
    v_validated := v_validated || jsonb_build_object('dark_mode', v_dark_mode);
  END IF;

  -- 7 boolean key: validate jsonb_typeof = 'boolean' (reject string "true",
  -- number 1, etc.) Khớp với UserSettings shape ở src/services/user.service.ts.
  FOREACH v_bool_key IN ARRAY ARRAY[
    'notify_activity',
    'notify_payment',
    'notify_member',
    'notify_smart',
    'push_enabled',
    'haptics_enabled',
    'animations_enabled'
  ]
  LOOP
    IF p_settings ? v_bool_key THEN
      IF jsonb_typeof(p_settings->v_bool_key) IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'invalid_settings_type' USING ERRCODE = '22023',
          DETAIL = format('%s must be boolean, got %s', v_bool_key, jsonb_typeof(p_settings->v_bool_key));
      END IF;
      v_validated := v_validated || jsonb_build_object(v_bool_key, p_settings->v_bool_key);
    END IF;
  END LOOP;

  -- Merge: giữ key cũ chưa có trong validated (vd payload từ client cũ thiếu
  -- push_enabled → giữ value đã set trước đó từ client khác). Key lạ ngoài
  -- whitelist: bị drop vì v_validated chỉ chứa key đã validate.
  UPDATE public.users
     SET settings = COALESCE(v_current_settings, '{}'::jsonb) || v_validated
   WHERE id = v_actor;

  RETURN QUERY
    SELECT u.id, u.version, u.settings, u.updated_at
      FROM public.users u WHERE u.id = v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_settings(jsonb, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_settings(jsonb, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_user_settings IS
  'LWW update settings jsonb. Whitelist + merge: chỉ ghi 8 key valid (dark_mode enum + 7 boolean), drop key lạ. Errors: unauthorized, invalid_base_updated_at, invalid_settings_shape, invalid_dark_mode, invalid_settings_type, user_not_found, lww_stale (P0410).';
