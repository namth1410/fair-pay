-- create_group: atomic insert groups + insert creator as admin in group_members.
-- Thay thế logic createGroup() ở src/services/group.service.ts vốn làm 2 client-side
-- INSERT — buộc policy "Admins can insert members" phải để OR (user_id = auth_user_id())
-- → leo quyền admin (B1). RPC này gom 2 insert vào server-side, đóng OR branch.
--
-- Errors:
--   - not_authenticated (42501): caller chưa đăng nhập
--   - invalid_group_name (P0001): name rỗng / >100 ký tự sau trim

CREATE OR REPLACE FUNCTION public.create_group(p_name text)
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

  INSERT INTO public.groups (name, created_by)
  VALUES (v_name, v_actor)
  RETURNING * INTO v_group;

  SELECT display_name INTO v_actor_name
    FROM public.users WHERE id = v_actor;

  INSERT INTO public.group_members (group_id, user_id, display_name, role)
  VALUES (v_group.id, v_actor, COALESCE(v_actor_name, 'Admin'), 'admin');

  -- Audit (silent — match pattern các RPC khác)
  PERFORM public._log_action(
    v_group.id,
    NULL,
    'group.created',
    NULL,
    NULL,
    jsonb_build_object('name', v_name)
  );

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(text) TO authenticated;

COMMENT ON FUNCTION public.create_group IS
  'Atomic: insert group + insert creator as admin member. Returns the new groups row.
   Errors: not_authenticated (42501), invalid_group_name (P0001).';

-- Siết RLS: drop OR branch self-insert (đóng escalation B1).
-- Sau migration này, mọi INSERT vào group_members BUỘC qua RPC (create_group,
-- approve_join_request, accept_invitation, addVirtualMember) — không còn đường raw INSERT.
DROP POLICY IF EXISTS "Admins can insert members" ON public.group_members;
CREATE POLICY "Admins can insert members" ON public.group_members
FOR INSERT
WITH CHECK (is_admin(group_id));
