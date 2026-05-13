-- request_join_by_code: atomic lookup-group-by-invite-code + active-member check + upsert pending join_request + notify admins.
-- Thay thế phần "lookup group + check membership + upsert request + notify" của joinGroupByCode() ở src/services/group.service.ts.
--
-- Lý do tồn tại: RLS trên `groups` và `group_members` chỉ cho phép is_member/created_by SELECT, nên
-- user chưa join KHÔNG thể tự query group bằng invite_code, cũng KHÔNG thể fan-out notify đến admins.
-- RPC SECURITY DEFINER bypass RLS để làm cả 4 bước atomic.
--
-- Errors:
--   - not_authenticated (42501): auth_user_id() null
--   - invalid_invite_code (P0002): code rỗng / không tồn tại / group đã xóa
--   - already_member (P0002): caller là active member của nhóm này rồi

CREATE OR REPLACE FUNCTION public.request_join_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_group public.groups%ROWTYPE;
  v_existing_active uuid;
  v_display_name text;
  v_request_id uuid;
  v_admin_recipients uuid[];
  v_title text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF length(v_code) = 0 THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_group
    FROM public.groups
   WHERE invite_code = v_code
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0002';
  END IF;

  -- Active member: caller đã ở trong nhóm → không cần xin join lại
  SELECT id INTO v_existing_active
    FROM public.group_members
   WHERE group_id = v_group.id
     AND user_id = v_actor
     AND left_at IS NULL
   LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0002';
  END IF;

  -- Fetch display_name cho request (admin sẽ thấy ở danh sách chờ duyệt)
  SELECT display_name INTO v_display_name
    FROM public.users
   WHERE id = v_actor;

  v_display_name := COALESCE(NULLIF(btrim(v_display_name), ''), 'Thành viên');

  -- Upsert: first-time INSERT, rejoin / re-request sau rejection → UPDATE về pending.
  -- ON CONFLICT khớp constraint UNIQUE (group_id, user_id) đã có sẵn.
  INSERT INTO public.join_requests (
    group_id, user_id, status, display_name, reviewed_by, reviewed_at, created_at
  )
  VALUES (
    v_group.id, v_actor, 'pending', v_display_name, NULL, NULL, now()
  )
  ON CONFLICT (group_id, user_id) DO UPDATE
     SET status = 'pending',
         display_name = EXCLUDED.display_name,
         reviewed_by = NULL,
         reviewed_at = NULL,
         created_at = now()
  RETURNING id INTO v_request_id;

  -- Notify admins: bypass RLS để fan-out tới user chưa-cùng-nhóm với requester.
  -- Filter: role='admin', active, có account thực, bật notify_member (mặc định true).
  SELECT COALESCE(array_agg(DISTINCT gm.user_id), ARRAY[]::uuid[])
    INTO v_admin_recipients
    FROM public.group_members gm
    JOIN public.users u ON u.id = gm.user_id
   WHERE gm.group_id = v_group.id
     AND gm.role = 'admin'
     AND gm.left_at IS NULL
     AND gm.user_id IS NOT NULL
     AND gm.user_id <> v_actor
     AND COALESCE((u.settings->>'notify_member')::boolean, true) = true;

  IF array_length(v_admin_recipients, 1) IS NOT NULL THEN
    v_title := v_display_name || ' muốn tham gia nhóm ' || v_group.name;
    PERFORM public._create_notifications_dedup(
      v_admin_recipients,
      'member.join_requested',
      v_actor,
      v_group.id,
      NULL,
      btrim(v_title),
      v_display_name,
      NULL,
      jsonb_build_object(
        'group_name', v_group.name,
        'request_id', v_request_id::text
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'requester_name', v_display_name,
    'group', to_jsonb(v_group)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_join_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_join_by_code(text) TO authenticated;

COMMENT ON FUNCTION public.request_join_by_code IS
  'Atomic: lookup group by invite_code + active-member check + upsert pending join_request + notify admins.
   Bypass RLS để non-member resolve được mã mời + fan-out notification tới admin.
   Errors: not_authenticated (42501), invalid_invite_code (P0002), already_member (P0002).';
