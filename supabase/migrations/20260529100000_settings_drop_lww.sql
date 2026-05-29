-- ============================================================================
-- Migration: Bỏ LWW conflict check cho update_user_settings.
-- ============================================================================
-- Vấn đề (race "save nhanh 2 toggle"):
--   `user_settings` là dữ liệu 1-user + server merge JSONB theo từng key
--   (`current || validated`). Hai patch KHÁC key (vd notify_activity vs
--   notify_payment) KHÔNG bao giờ đè nhau. Thứ duy nhất chế ra conflict GIẢ là
--   check LWW `current.updated_at > base + 1ms`:
--
--   - Online bấm nhanh 2 toggle: cả 2 call đọc cùng base T0 (đọc SQLite local
--     sub-ms, trước khi round-trip của call đầu writeback xong). Call đầu commit
--     bump updated_at → T1; call sau gửi base T0 < T1 → P0410 lww_stale.
--     Ở Flow A trực tiếp (updateSettings online), P0410 không phải network error
--     → throw thẳng → UI rollback optimistic + toast sai ("đã cập nhật ở thiết
--     bị khác") + MẤT thay đổi (không enqueue, không conflict modal).
--   - Offline 2 toggle: op sau enqueue base = client-time; replay sau server đã
--     bump sang server-time → lww_stale → conflict modal cho 2 key chẳng đụng
--     nhau (pre-existing).
--
-- Quyết định (D): bỏ optimistic concurrency / LWW cho settings.
--   Lý do: entity 1-user + JSONB key-merge thì LWW không bảo vệ gì ngoài việc
--   tạo conflict giả. Khác key → merge sạch. Cùng key bấm nhanh →
--   last-arrival-wins = đúng ý 1 cái toggle. Đánh đổi đã chấp nhận: mất phát
--   hiện "ghi đè stale cross-device" cho settings (kẻ ghi cuối thắng âm thầm
--   thay vì bắn modal) — chấp nhận được với toggle cá nhân.
--
-- Thay đổi so với 20260528130000_restore_user_settings_validation.sql:
--   - BỎ block reject NULL p_base_updated_at (base không còn dùng).
--   - BỎ block LWW `current.updated_at > base + 1ms` → lww_stale.
--   - GIỮ NGUYÊN: signature (backward-compat — client cũ + payload đã queue vẫn
--     gửi p_base_updated_at, server bỏ qua), whitelist + validate type + JSONB
--     merge, RETURNS (version + updated_at để client write-back), REVOKE/GRANT.
--   `p_base_updated_at` giữ trong signature nhưng KHÔNG dùng (unused param).
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

  -- LWW conflict check ĐÃ BỎ (xem header). Settings 1-user + JSONB key-merge →
  -- last-arrival-wins, không cần optimistic concurrency. p_base_updated_at giữ
  -- trong signature cho backward-compat nhưng KHÔNG còn dùng.

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
  'Update settings jsonb (last-arrival-wins, KHÔNG LWW — settings 1-user + JSONB key-merge). Whitelist + merge: chỉ ghi 8 key valid (dark_mode enum + 7 boolean), drop key lạ. p_base_updated_at giữ cho backward-compat nhưng unused. Errors: unauthorized, invalid_settings_shape, invalid_dark_mode, invalid_settings_type, user_not_found.';
