-- Invitation RPCs (admin invite by email → user accept/decline → admin revoke).
-- 5 functions: invite_member_by_email, respond_to_invitation, revoke_invitation,
--              get_pending_invitations_for_group, get_my_pending_invitations.
--
-- Tất cả SECURITY DEFINER + REVOKE PUBLIC + GRANT authenticated.
-- Actor = auth_user_id() ở SQL — KHÔNG nhận p_actor_id từ client (chống spoofing).
-- Notification được tạo atomic trong RPC qua _create_notifications_dedup
-- để toast/badge ở client cập nhật cùng lúc với invitation state.

-- ──────────────────────────────────────────────────────────────────────────────
-- invite_member_by_email: admin tạo invitation pending cho user qua email.
--
-- Errors:
--   - not_authenticated (42501): caller chưa đăng nhập
--   - not_authorized (42501): caller không phải admin của group
--   - email_invalid_or_not_found (P0002): email syntax invalid hoặc không tồn tại
--     trong public.users (generic, chống enumeration)
--   - cannot_invite_self (P0001): caller invite chính mình
--   - already_member (P0002): user đã là active member của group
--   - already_invited (P0002): đã có pending invitation cho user trong group
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_member_by_email(
  p_group_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invited_user_id uuid;
  v_invited_name text;
  v_actor_name text;
  v_group_name text;
  v_inv_id uuid;
  v_notify_enabled boolean;
  v_title text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF length(v_email) = 0
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'email_invalid_or_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, COALESCE(NULLIF(btrim(display_name), ''), email)
    INTO v_invited_user_id, v_invited_name
    FROM public.users
   WHERE lower(email) = v_email
   LIMIT 1;

  IF v_invited_user_id IS NULL THEN
    RAISE EXCEPTION 'email_invalid_or_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invited_user_id = v_actor THEN
    RAISE EXCEPTION 'cannot_invite_self' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_members
     WHERE group_id = p_group_id
       AND user_id = v_invited_user_id
       AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_invitations
     WHERE group_id = p_group_id
       AND invited_user_id = v_invited_user_id
       AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'already_invited' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO public.group_invitations (
      group_id, invited_email, invited_user_id, invited_by, status
    ) VALUES (
      p_group_id, v_email, v_invited_user_id, v_actor, 'pending'
    )
    RETURNING id INTO v_inv_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_invited' USING ERRCODE = 'P0002';
  END;

  SELECT name INTO v_group_name FROM public.groups WHERE id = p_group_id;
  SELECT COALESCE(NULLIF(btrim(display_name), ''), 'Thành viên')
    INTO v_actor_name FROM public.users WHERE id = v_actor;

  PERFORM public._log_action(
    p_group_id,
    NULL,
    'member.invited',
    v_invited_user_id,
    NULL,
    jsonb_build_object(
      'email', v_email,
      'invitation_id', v_inv_id::text
    )
  );

  -- Notify invited user nếu họ bật notify_member (mặc định true).
  SELECT COALESCE((u.settings->>'notify_member')::boolean, true)
    INTO v_notify_enabled
    FROM public.users u
   WHERE u.id = v_invited_user_id;

  IF v_notify_enabled THEN
    v_title := v_actor_name || ' mời bạn vào nhóm ' || COALESCE(v_group_name, '');
    PERFORM public._create_notifications_dedup(
      ARRAY[v_invited_user_id],
      'member.invite_received',
      v_actor,
      p_group_id,
      NULL,
      btrim(v_title),
      v_actor_name,
      NULL,
      jsonb_build_object(
        'group_name', COALESCE(v_group_name, ''),
        'invitation_id', v_inv_id::text,
        'target_id', v_inv_id::text
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'invitation_id', v_inv_id,
    'invited_user_id', v_invited_user_id,
    'invited_name', v_invited_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_member_by_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_member_by_email(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.invite_member_by_email IS
  'Atomic: admin tạo invitation pending qua email + audit + notify invited user.
   Errors: not_authenticated (42501), not_authorized (42501),
   email_invalid_or_not_found (P0002), cannot_invite_self (P0001),
   already_member (P0002), already_invited (P0002).';

-- ──────────────────────────────────────────────────────────────────────────────
-- respond_to_invitation: user accept hoặc decline invitation pending của họ.
--
-- Errors:
--   - not_authenticated (42501)
--   - invalid_action (P0001): p_action không phải 'accept' / 'decline'
--   - invitation_not_found (P0002): không tồn tại hoặc không phải của caller
--     (treat cross-tenant = missing để không leak)
--   - invitation_not_pending (P0002): đã accepted/declined/revoked
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_to_invitation(
  p_invitation_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_inv public.group_invitations%ROWTYPE;
  v_user_display text;
  v_group_name text;
  v_inviter_notify boolean;
  v_old_member_id uuid;
  v_title text;
  v_new_status public.invitation_status;
  v_notif_type text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_inv
    FROM public.group_invitations
   WHERE id = p_invitation_id
     AND invited_user_id = v_actor
   LIMIT 1;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation_not_pending' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'accept' THEN
    v_new_status := 'accepted';
    v_notif_type := 'member.invite_accepted';
  ELSE
    v_new_status := 'declined';
    v_notif_type := 'member.invite_declined';
  END IF;

  UPDATE public.group_invitations
     SET status = v_new_status,
         responded_at = now()
   WHERE id = p_invitation_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_pending' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(NULLIF(btrim(display_name), ''), 'Thành viên')
    INTO v_user_display
    FROM public.users
   WHERE id = v_actor;

  SELECT name INTO v_group_name FROM public.groups WHERE id = v_inv.group_id;

  IF p_action = 'accept' THEN
    -- Rejoin nếu user từng là member rồi rời (giữ history expense/payment)
    SELECT id INTO v_old_member_id
      FROM public.group_members
     WHERE group_id = v_inv.group_id
       AND user_id = v_actor
       AND left_at IS NOT NULL
     LIMIT 1;

    IF v_old_member_id IS NOT NULL THEN
      UPDATE public.group_members
         SET left_at = NULL,
             role = 'member'
       WHERE id = v_old_member_id;
    ELSE
      BEGIN
        INSERT INTO public.group_members (group_id, user_id, display_name, role)
        VALUES (v_inv.group_id, v_actor, v_user_display, 'member');
      EXCEPTION WHEN unique_violation THEN
        -- Race: active member đã tồn tại (admin/admin khác đã thêm) — bỏ qua
        NULL;
      END;
    END IF;
  END IF;

  PERFORM public._log_action(
    v_inv.group_id,
    NULL,
    CASE WHEN p_action = 'accept' THEN 'member.invite_accepted'
         ELSE 'member.invite_declined' END,
    v_actor,
    NULL,
    jsonb_build_object(
      'invitation_id', p_invitation_id::text,
      'invited_by', v_inv.invited_by::text
    )
  );

  -- Notify inviter (single recipient, không cần dedup helper).
  SELECT COALESCE((u.settings->>'notify_member')::boolean, true)
    INTO v_inviter_notify
    FROM public.users u
   WHERE u.id = v_inv.invited_by;

  IF v_inviter_notify AND v_inv.invited_by <> v_actor THEN
    v_title := v_user_display
            || CASE WHEN p_action = 'accept' THEN ' đã chấp nhận lời mời vào nhóm '
                    ELSE ' đã từ chối lời mời vào nhóm ' END
            || COALESCE(v_group_name, '');
    PERFORM public._create_notifications_dedup(
      ARRAY[v_inv.invited_by],
      v_notif_type,
      v_actor,
      v_inv.group_id,
      NULL,
      btrim(v_title),
      v_user_display,
      NULL,
      jsonb_build_object(
        'group_name', COALESCE(v_group_name, ''),
        'invitation_id', p_invitation_id::text,
        'target_id', p_invitation_id::text
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'group_id', v_inv.group_id,
    'group_name', COALESCE(v_group_name, ''),
    'status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_invitation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_invitation(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.respond_to_invitation IS
  'User accept/decline invitation của chính mình + atomic insert/rejoin member nếu accept + audit + notify inviter.
   Errors: not_authenticated (42501), invalid_action (P0001),
   invitation_not_found (P0002), invitation_not_pending (P0002).';

-- ──────────────────────────────────────────────────────────────────────────────
-- revoke_invitation: admin rút lời mời pending.
--
-- Errors:
--   - not_authenticated (42501)
--   - invitation_not_found (P0002): không tồn tại
--   - not_authorized (42501): caller không phải admin của group
--   - invitation_not_pending (P0002): đã terminal
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_inv public.group_invitations%ROWTYPE;
  v_actor_name text;
  v_group_name text;
  v_invitee_notify boolean;
  v_title text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
    FROM public.group_invitations
   WHERE id = p_invitation_id
   LIMIT 1;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_inv.group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation_not_pending' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.group_invitations
     SET status = 'revoked',
         responded_at = now()
   WHERE id = p_invitation_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_pending' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._log_action(
    v_inv.group_id,
    NULL,
    'member.invite_revoked',
    v_inv.invited_user_id,
    NULL,
    jsonb_build_object('invitation_id', p_invitation_id::text)
  );

  -- Notify invitee (best-effort, không block flow).
  SELECT COALESCE((u.settings->>'notify_member')::boolean, true)
    INTO v_invitee_notify
    FROM public.users u
   WHERE u.id = v_inv.invited_user_id;

  IF v_invitee_notify THEN
    SELECT COALESCE(NULLIF(btrim(display_name), ''), 'Thành viên')
      INTO v_actor_name FROM public.users WHERE id = v_actor;
    SELECT name INTO v_group_name FROM public.groups WHERE id = v_inv.group_id;

    v_title := 'Lời mời vào nhóm ' || COALESCE(v_group_name, '') || ' đã bị thu hồi';
    PERFORM public._create_notifications_dedup(
      ARRAY[v_inv.invited_user_id],
      'member.invite_revoked',
      v_actor,
      v_inv.group_id,
      NULL,
      btrim(v_title),
      v_actor_name,
      NULL,
      jsonb_build_object(
        'group_name', COALESCE(v_group_name, ''),
        'invitation_id', p_invitation_id::text,
        'target_id', p_invitation_id::text
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.revoke_invitation IS
  'Admin rút invitation pending + audit + notify invitee.
   Errors: not_authenticated (42501), invitation_not_found (P0002),
   not_authorized (42501), invitation_not_pending (P0002).';

-- ──────────────────────────────────────────────────────────────────────────────
-- get_pending_invitations_for_group: admin xem danh sách invitations đang chờ.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_invitations_for_group(p_group_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', gi.id,
        'group_id', gi.group_id,
        'invited_email', gi.invited_email,
        'invited_user_id', gi.invited_user_id,
        'invited_by', gi.invited_by,
        'status', gi.status,
        'created_at', gi.created_at,
        'responded_at', gi.responded_at,
        'invited_display_name', u.display_name,
        'invited_photo_url', u.photo_url
      )
      ORDER BY gi.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.group_invitations gi
  JOIN public.users u ON u.id = gi.invited_user_id
  WHERE gi.group_id = p_group_id
    AND gi.status = 'pending'
    AND public.is_admin(p_group_id);
$$;

REVOKE ALL ON FUNCTION public.get_pending_invitations_for_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_invitations_for_group(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_pending_invitations_for_group IS
  'Admin-only: danh sách invitations pending của group, kèm display_name/photo_url của invitee.
   Non-admin nhận về [] (filter is_admin trong WHERE thay vì RAISE).';

-- ──────────────────────────────────────────────────────────────────────────────
-- get_my_pending_invitations: user xem invitations đang mời chính họ.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'invitation_id', gi.id,
        'group_id', gi.group_id,
        'group_name', g.name,
        'group_avatar_url', g.avatar_url,
        'inviter_name', COALESCE(NULLIF(btrim(u.display_name), ''), 'Thành viên'),
        'created_at', gi.created_at
      )
      ORDER BY gi.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.group_invitations gi
  JOIN public.groups g ON g.id = gi.group_id AND g.deleted_at IS NULL
  JOIN public.users u  ON u.id = gi.invited_by
  WHERE gi.invited_user_id = public.auth_user_id()
    AND gi.status = 'pending';
$$;

REVOKE ALL ON FUNCTION public.get_my_pending_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_invitations IS
  'User xem các invitation pending dành cho mình, kèm group + inviter info.
   Filter qua auth_user_id() — không nhận tham số để tránh spoof.';
