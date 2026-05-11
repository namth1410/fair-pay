-- Internal helpers for atomic RPCs (create_expense, approve_join_request, create_notifications_batch).
-- Tất cả đều SECURITY DEFINER + SET search_path tránh search_path attack.
-- KHÔNG GRANT cho authenticated — chỉ gọi nội bộ giữa các RPC SECURITY DEFINER chain.

-- ──────────────────────────────────────────────────────────────────────────────
-- _get_group_recipients: resolve user_id[] nhận notification cho 1 group event.
-- Mirror logic của getGroupRecipients() trong src/services/notification.service.ts:
--   - left_at IS NULL (active member)
--   - is_virtual = false (không phải member ảo)
--   - user_id IS NOT NULL (có account thực)
--   - user_id != p_exclude_user (loại actor)
--   - COALESCE((users.settings->>p_setting_key)::boolean, true) = true
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._get_group_recipients(
  p_group_id uuid,
  p_setting_key text,
  p_exclude_user uuid
)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT gm.user_id), ARRAY[]::uuid[])
  FROM public.group_members gm
  JOIN public.users u ON u.id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND gm.left_at IS NULL
    AND COALESCE(gm.is_virtual, false) = false
    AND gm.user_id IS NOT NULL
    AND (p_exclude_user IS NULL OR gm.user_id <> p_exclude_user)
    AND COALESCE((u.settings->>p_setting_key)::boolean, true) = true;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- _format_dedup_title: reformat title khi dedup count > 1.
-- Chỉ các expense.* types có plural form. Các type khác giữ nguyên title gốc.
-- Đồng bộ với formatNotificationTitle() trong src/utils/notificationFormat.ts.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._format_dedup_title(
  p_type text,
  p_actor_name text,
  p_count int,
  p_original_title text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_count <= 1 THEN p_original_title
    WHEN p_type = 'expense.created' THEN p_actor_name || ' đã thêm ' || p_count::text || ' khoản chi'
    WHEN p_type = 'expense.edited'  THEN p_actor_name || ' đã sửa '  || p_count::text || ' khoản chi'
    WHEN p_type = 'expense.deleted' THEN p_actor_name || ' đã xóa '  || p_count::text || ' khoản chi'
    ELSE p_original_title
  END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- _create_notifications_dedup: atomic dedup writer.
-- Window 10 phút khớp NOTIF_DEDUP_WINDOW_MS ở src/config/constants.ts.
-- Với mỗi recipient: nếu đã có notif chưa-đọc cùng (group, type, actor) trong window
-- → UPDATE row đó (push target_id, tăng count, refresh created_at). Không thì INSERT.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._create_notifications_dedup(
  p_recipients uuid[],
  p_type text,
  p_actor_id uuid,
  p_group_id uuid,
  p_trip_id uuid,
  p_title text,
  p_actor_name text,
  p_body text,
  p_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since timestamptz := now() - interval '10 minutes';
  v_user uuid;
  v_existing_id uuid;
  v_old_data jsonb;
  v_new_count int;
  v_new_ids jsonb;
  v_new_target text;
BEGIN
  IF p_recipients IS NULL OR array_length(p_recipients, 1) IS NULL THEN
    RETURN;
  END IF;

  v_new_target := p_data->>'target_id';

  FOREACH v_user IN ARRAY p_recipients LOOP
    -- Tìm notif chưa đọc khớp dedup key
    SELECT id, data
      INTO v_existing_id, v_old_data
      FROM public.notifications
     WHERE user_id = v_user
       AND type = p_type
       AND read_at IS NULL
       AND created_at >= v_since
       AND ((p_group_id IS NULL AND group_id IS NULL) OR group_id = p_group_id)
       AND ((p_actor_id IS NULL AND actor_id IS NULL) OR actor_id = p_actor_id)
     LIMIT 1;

    IF FOUND THEN
      v_new_count := COALESCE((v_old_data->>'count')::int, 1) + 1;
      v_new_ids := COALESCE(v_old_data->'target_ids', '[]'::jsonb);
      IF v_new_target IS NOT NULL AND NOT (v_new_ids @> to_jsonb(v_new_target)) THEN
        v_new_ids := v_new_ids || to_jsonb(v_new_target);
      END IF;

      UPDATE public.notifications
         SET title = public._format_dedup_title(p_type, p_actor_name, v_new_count, p_title),
             data = v_old_data
                    || jsonb_build_object('count', v_new_count)
                    || jsonb_build_object('target_ids', v_new_ids),
             created_at = now()
       WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.notifications (
        user_id, group_id, trip_id, type, actor_id, title, body, data
      ) VALUES (
        v_user,
        p_group_id,
        p_trip_id,
        p_type,
        p_actor_id,
        p_title,
        p_body,
        COALESCE(p_data, '{}'::jsonb)
          || jsonb_build_object('count', 1)
          || jsonb_build_object(
               'target_ids',
               CASE WHEN v_new_target IS NULL THEN '[]'::jsonb
                    ELSE jsonb_build_array(v_new_target) END
             )
      );
    END IF;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- _log_action: internal audit writer dùng từ RPC. Actor = auth_user_id().
-- Im lặng nếu user chưa auth (RPC khác đã reject trước đó, đây là defense in depth).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._log_action(
  p_group_id uuid,
  p_trip_id uuid,
  p_action text,
  p_target_id uuid,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
BEGIN
  IF v_actor IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_logs (group_id, trip_id, action, actor_id, target_id, before_data, after_data)
  VALUES (p_group_id, p_trip_id, p_action, v_actor, p_target_id, p_before, p_after);
END;
$$;

-- Helpers là internal — REVOKE để đảm bảo không call trực tiếp từ client.
REVOKE ALL ON FUNCTION public._get_group_recipients(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._format_dedup_title(text, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._create_notifications_dedup(uuid[], text, uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._log_action(uuid, uuid, text, uuid, jsonb, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public._get_group_recipients IS 'Internal helper. Mirror getGroupRecipients() TS — sync khi sửa logic.';
COMMENT ON FUNCTION public._format_dedup_title IS 'Internal helper. Mirror formatNotificationTitle() TS branch count>1 — sync với src/utils/notificationFormat.ts.';
COMMENT ON FUNCTION public._create_notifications_dedup IS 'Internal helper. Atomic dedup UPDATE/INSERT notifications, window 10 min. Sync với NOTIF_DEDUP_WINDOW_MS ở src/config/constants.ts.';
COMMENT ON FUNCTION public._log_action IS 'Internal helper. Insert audit_logs với actor = auth_user_id(). Im lặng nếu unauthenticated.';
