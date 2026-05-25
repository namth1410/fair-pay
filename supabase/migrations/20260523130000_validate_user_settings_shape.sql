-- ============================================================================
-- Migration: Validate shape của p_settings jsonb trong update_user_settings.
-- ============================================================================
-- Fix I7 (CODE_REVIEW.md). Vấn đề: RPC cũ chạy `UPDATE users SET settings =
-- p_settings` không validate gì → user-as-attacker (role authenticated) có thể
-- gọi RPC trực tiếp qua PostgREST với jsonb tùy ý:
--
--   1. Self-corrupt: dark_mode = "rác", push_enabled = "yes" (string truthy)
--      → bypass UI/push toggle logic.
--   2. DoS toàn group (NGHIÊM TRỌNG): set notify_activity = "rác" → mọi RPC
--      gọi _get_group_recipients (create_expense, create_payment,
--      approve_join_request, invite_*) crash với 22P02 invalid_input_syntax
--      khi cast (u.settings->>'notify_activity')::boolean → cả group không
--      tạo được expense/payment tới khi DB fix bằng tay.
--   3. Row bloat: jsonb > 1KB → pull worker delta sync chậm.
--
-- TS type UserSettings ở user.service.ts là compile-time only — attacker
-- bypass bằng curl trực tiếp đến PostgREST với JWT hợp lệ (sau khi sign up).
-- REVOKE FROM PUBLIC + GRANT TO authenticated KHÔNG đủ — authenticated là
-- mọi user đã login, không phải "trusted internal".
--
-- Strategy: whitelist + merge (thay vì replace nguyên xi).
--   - Reject sớm nếu p_settings không phải jsonb object.
--   - dark_mode: enum 'system' | 'light' | 'dark' → reject value khác.
--   - 6 boolean key: reject nếu jsonb_typeof <> 'boolean' (reject "true"
--     string, number 1, etc.).
--   - Key không trong whitelist: silent drop (không reject, để client cũ
--     gửi key đã deprecate vẫn pass).
--   - Merge với current settings (current || validated) → giữ key có sẵn nếu
--     payload thiếu, tránh client cũ wipe key mới của client khác.
--
-- Combo fix I14: reject p_base_updated_at IS NULL (trước đó NULL > timestamp
-- = NULL → IF skip → silent overwrite).
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

-- ============================================================================
-- Cleanup data hiện có (best-effort defense-in-depth)
-- ============================================================================
-- Nếu prod đã có row rác (sau exploit hoặc bug client cũ), normalize value
-- không-phải-boolean về DEFAULT (true cho notify_*, true cho push/haptics/anim,
-- 'system' cho dark_mode). KHÔNG ghi đè boolean valid.
-- ============================================================================

UPDATE public.users
SET settings = COALESCE(settings, '{}'::jsonb)
  || CASE WHEN jsonb_typeof(settings->'dark_mode') = 'string'
              AND (settings->>'dark_mode') IN ('system','light','dark')
          THEN '{}'::jsonb
          ELSE jsonb_build_object('dark_mode', 'system') END
  || CASE WHEN jsonb_typeof(settings->'notify_activity') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('notify_activity', true) END
  || CASE WHEN jsonb_typeof(settings->'notify_payment') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('notify_payment', true) END
  || CASE WHEN jsonb_typeof(settings->'notify_member') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('notify_member', true) END
  || CASE WHEN jsonb_typeof(settings->'notify_smart') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('notify_smart', true) END
  || CASE WHEN jsonb_typeof(settings->'push_enabled') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('push_enabled', true) END
  || CASE WHEN jsonb_typeof(settings->'haptics_enabled') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('haptics_enabled', true) END
  || CASE WHEN jsonb_typeof(settings->'animations_enabled') = 'boolean'
          THEN '{}'::jsonb
          ELSE jsonb_build_object('animations_enabled', true) END
WHERE settings IS NULL
   OR jsonb_typeof(settings) <> 'object'
   OR jsonb_typeof(settings->'dark_mode') NOT IN ('string', 'null')
   OR (jsonb_typeof(settings->'dark_mode') = 'string'
       AND (settings->>'dark_mode') NOT IN ('system','light','dark'))
   OR jsonb_typeof(settings->'notify_activity') NOT IN ('boolean', 'null')
   OR jsonb_typeof(settings->'notify_payment') NOT IN ('boolean', 'null')
   OR jsonb_typeof(settings->'notify_member') NOT IN ('boolean', 'null')
   OR jsonb_typeof(settings->'notify_smart') NOT IN ('boolean', 'null')
   OR jsonb_typeof(settings->'push_enabled') NOT IN ('boolean', 'null')
   OR jsonb_typeof(settings->'haptics_enabled') NOT IN ('boolean', 'null')
   OR jsonb_typeof(settings->'animations_enabled') NOT IN ('boolean', 'null');

-- Note: WHERE filter chỉ touch row có vấn đề → row đã sạch KHÔNG bị
-- bump_version_and_updated_at trigger fire → tránh false invalidate cho LWW
-- của client offline đang sync.
