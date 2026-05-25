-- create_group: sửa 3 bug ở migration 20260523120000_create_group_offline_first.sql:
--   Bug 1: p_client_request_id khai báo `text` nhưng column groups/group_members.client_request_id
--          là `uuid` → INSERT throw errcode 42804 datatype_mismatch.
--   Bug 2: ON CONFLICT (client_request_id) thiếu predicate WHERE — chỉ có partial unique index
--          `idx_groups_client_request_id ... WHERE (client_request_id IS NOT NULL)`, không có
--          full unique constraint → Postgres không match được index inference → throw errcode
--          42P10 "no unique or exclusion constraint matching the ON CONFLICT specification".
--   Bug 3: _log_action gọi với p_target_id = NULL nhưng `audit_logs.target_id` là NOT NULL →
--          INSERT vào audit_logs throw 23502 not_null_violation. Fix: pass v_group.id (group là
--          target của action 'group.created').
--
-- Hệ quả: mọi call create_group (online lẫn queue-replay) đều fail từ 2026-05-23 → sync queue
-- stuck với status='failed', retry vô tận.
--
-- DROP + CREATE (không REPLACE) vì Postgres không cho REPLACE đổi argument types.

DROP FUNCTION IF EXISTS public.create_group(uuid, text, uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_group(
  p_id uuid,
  p_name text,
  p_admin_member_id uuid,
  p_client_request_id uuid,
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

  -- Idempotency: thử insert; nếu duplicate client_request_id → trả lại row đã có.
  -- WHERE predicate phải khớp với partial unique index idx_groups_client_request_id.
  INSERT INTO public.groups (id, name, created_by, client_request_id)
  VALUES (p_id, v_name, v_actor, p_client_request_id)
  ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
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

  -- ON CONFLICT WHERE predicate khớp partial index idx_group_members_client_request_id.
  INSERT INTO public.group_members
    (id, group_id, user_id, display_name, role, client_request_id)
  VALUES
    (p_admin_member_id, v_group.id, v_actor,
     COALESCE(v_actor_name, 'Admin'), 'admin', p_client_request_id)
  ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING;

  -- target_id = v_group.id vì group là target của action 'group.created'
  -- (audit_logs.target_id NOT NULL).
  PERFORM public._log_action(
    v_group.id,
    NULL,
    'group.created',
    v_group.id,
    NULL,
    jsonb_build_object('name', v_name, 'client_created_at', p_client_created_at)
  );

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group(uuid, text, uuid, uuid, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(uuid, text, uuid, uuid, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.create_group(uuid, text, uuid, uuid, timestamptz) IS
  'Atomic + idempotent: insert group + admin member, return groups row.
   Replay-safe qua client_request_id (ON CONFLICT DO NOTHING + lookup fallback).
   Errors: not_authenticated (42501), invalid_group_name (P0001),
   create_group_idempotency_lookup_failed (P0001).';
