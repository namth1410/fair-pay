-- create_group: phiên bản idempotent cho offline-first (I1 + I9).
--
-- Khác với migration 20260522120000_create_group_rpc_and_tighten_member_insert_policy.sql:
--   - Nhận `p_id` (client-gen UUID) thay vì để server gen → cho phép client mirror
--     row vào SQLite local lúc offline, đồng nhất id local ↔ server sau khi sync.
--   - Nhận `p_admin_member_id` để admin row group_members cũng có id ổn định —
--     tránh duplicate khi pull cycle fetch lại admin row.
--   - Nhận `p_client_request_id` + `ON CONFLICT (client_request_id) DO NOTHING`
--     → replay queue 2 lần (network flaky / device crash) KHÔNG tạo 2 group trùng.
--   - Trả về row đã tồn tại khi replay duplicate (fix I9).
--
-- KHÔNG nhận `p_invite_code` — server giữ DEFAULT làm source-of-truth cho mã mời
-- unique. Client dùng placeholder local (prefix "PEND-") cho UX, pull cycle sẽ
-- overwrite bằng giá trị thật từ server.
--
-- Errors:
--   - not_authenticated (42501): caller chưa đăng nhập
--   - invalid_group_name (P0001): name rỗng / >100 ký tự sau trim
--   - create_group_idempotency_lookup_failed (P0001): bất thường nội bộ — replay
--     conflict ở INSERT nhưng SELECT lại không tìm thấy (rất hiếm, defensive)

CREATE OR REPLACE FUNCTION public.create_group(
  p_id uuid,
  p_name text,
  p_admin_member_id uuid,
  p_client_request_id text,
  p_client_created_at timestamptz
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_actor_name text;
  v_name text := btrim(COALESCE(p_name, ''));
  v_group public.groups;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_name = '' OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_group_name' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: thử insert; nếu duplicate client_request_id → trả lại row đã có
  INSERT INTO public.groups (id, name, created_by, client_request_id)
  VALUES (p_id, v_name, v_actor, p_client_request_id)
  ON CONFLICT (client_request_id) DO NOTHING
  RETURNING * INTO v_group;

  IF v_group.id IS NULL THEN
    -- Replay đã thấy: lookup + return, không insert lại member, không log lại
    SELECT * INTO v_group
      FROM public.groups
     WHERE client_request_id = p_client_request_id;
    IF v_group.id IS NULL THEN
      RAISE EXCEPTION 'create_group_idempotency_lookup_failed'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN v_group;
  END IF;

  -- First-time path: insert admin member + audit
  SELECT display_name INTO v_actor_name FROM public.users WHERE id = v_actor;

  INSERT INTO public.group_members
    (id, group_id, user_id, display_name, role, client_request_id)
  VALUES
    (p_admin_member_id, v_group.id, v_actor,
     COALESCE(v_actor_name, 'Admin'), 'admin', p_client_request_id)
  ON CONFLICT (client_request_id) DO NOTHING;

  PERFORM public._log_action(
    v_group.id,
    NULL,
    'group.created',
    NULL,
    NULL,
    jsonb_build_object('name', v_name, 'client_created_at', p_client_created_at)
  );

  RETURN v_group;
END;
$$;

-- Drop signature cũ (1 param) để tránh ambiguity / shadowing
DROP FUNCTION IF EXISTS public.create_group(text);

REVOKE ALL ON FUNCTION public.create_group(uuid, text, uuid, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(uuid, text, uuid, text, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.create_group(uuid, text, uuid, text, timestamptz) IS
  'Atomic + idempotent: insert group + admin member, return groups row.
   Replay-safe qua client_request_id (ON CONFLICT DO NOTHING + lookup fallback).
   Errors: not_authenticated (42501), invalid_group_name (P0001),
   create_group_idempotency_lookup_failed (P0001).';
