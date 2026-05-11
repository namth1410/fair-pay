-- approve_join_request: atomic insert/rejoin member + update request status + audit + notify.
-- Thay thế logic approveJoinRequest() ở src/services/group.service.ts.
-- Admin only. Chặn cross-tenant spoof bằng filter group_id ở tất cả select/update.
--
-- Caller TS truyền p_group_name để render title VN ("Bạn đã được duyệt vào nhóm X").
--
-- Errors:
--   - not_authorized (42501): caller không phải admin
--   - request_not_found (P0002): request không tồn tại / không pending / cross-tenant

CREATE OR REPLACE FUNCTION public.approve_join_request(
  p_request_id uuid,
  p_group_id uuid,
  p_group_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_requester_user uuid;
  v_requester_name text;
  v_old_member_id uuid;
  v_notify_enabled boolean;
  v_title text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Fetch + filter group_id + status='pending' để chặn cross-tenant spoof + double-process
  SELECT user_id, display_name
    INTO v_requester_user, v_requester_name
    FROM public.join_requests
   WHERE id = p_request_id
     AND group_id = p_group_id
     AND status = 'pending';

  IF v_requester_user IS NULL THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Check old member (đã rời) — rejoin để kế thừa lịch sử (BR-04)
  SELECT id INTO v_old_member_id
    FROM public.group_members
   WHERE group_id = p_group_id
     AND user_id = v_requester_user
     AND left_at IS NOT NULL
   LIMIT 1;

  IF v_old_member_id IS NOT NULL THEN
    UPDATE public.group_members
       SET left_at = NULL
     WHERE id = v_old_member_id;
  ELSE
    -- INSERT new member. Nếu race với admin khác → UNIQUE violation 23505 sẽ
    -- abort cả transaction; trường hợp đó người kia đã thêm member rồi nên OK.
    BEGIN
      INSERT INTO public.group_members (group_id, user_id, display_name, role)
      VALUES (p_group_id, v_requester_user, v_requester_name, 'member');
    EXCEPTION WHEN unique_violation THEN
      -- Active member đã tồn tại (race) — bỏ qua insert, vẫn tiếp tục flow
      NULL;
    END;
  END IF;

  -- UPDATE status với double-check pending → chặn double-fire khi 2 admin race
  UPDATE public.join_requests
     SET status = 'approved',
         reviewed_by = v_actor,
         reviewed_at = now()
   WHERE id = p_request_id
     AND group_id = p_group_id
     AND status = 'pending';

  -- Audit
  PERFORM public._log_action(
    p_group_id,
    NULL,
    'member.join_approved',
    v_requester_user,
    NULL,
    jsonb_build_object('display_name', v_requester_name, 'request_id', p_request_id::text)
  );

  -- Notify requester nếu họ bật notify_member (mặc định true).
  -- Không qua _create_notifications_dedup vì single recipient + không cần dedup approval.
  IF v_requester_user <> v_actor THEN
    SELECT COALESCE((u.settings->>'notify_member')::boolean, true)
      INTO v_notify_enabled
      FROM public.users u
     WHERE u.id = v_requester_user;

    IF v_notify_enabled THEN
      v_title := 'Bạn đã được duyệt vào nhóm ' || COALESCE(p_group_name, '');
      INSERT INTO public.notifications (
        user_id, group_id, trip_id, type, actor_id, title, body, data
      )
      VALUES (
        v_requester_user,
        p_group_id,
        NULL,
        'member.join_approved',
        v_actor,
        btrim(v_title),
        NULL,
        jsonb_build_object(
          'count', 1,
          'target_ids', '[]'::jsonb,
          'group_name', COALESCE(p_group_name, '')
        )
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.approve_join_request IS
  'Atomic: insert/rejoin member + update request status + audit + notify requester. Admin only.
   Errors: not_authorized (42501), request_not_found (P0002).';
