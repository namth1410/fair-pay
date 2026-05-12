-- Fix race condition trong _create_notifications_dedup.
--
-- Bug: SELECT-then-INSERT/UPDATE không atomic. Hai RPC call đồng thời cùng
-- dedup key (user_id, type, group_id, actor_id) đều có thể đọc "không thấy
-- row nào", rồi cả hai cùng INSERT → 2 row trùng thay vì 1 row count=2.
-- Hệ quả: dedup im lặng broken khi actor double-tap submit hoặc tạo nhiều
-- expense back-to-back.
--
-- Fix: pg_advisory_xact_lock per dedup key — serialize SELECT-then-write
-- cho cùng key, không block các key khác. Lock auto-release ở COMMIT/ROLLBACK.
-- hashtextextended → bigint (64-bit) để collision rate ≈ 0 trong scope app.

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
    -- Serialize dedup cho cùng (user, type, group, actor) — chống race
    -- giữa các RPC call đồng thời. Lock release tự động ở end-of-tx.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_user::text || ':' || p_type || ':' ||
        COALESCE(p_group_id::text, '') || ':' ||
        COALESCE(p_actor_id::text, ''),
        0
      )
    );

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

REVOKE ALL ON FUNCTION public._create_notifications_dedup(uuid[], text, uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION public._create_notifications_dedup IS
  'Internal helper. Atomic dedup UPDATE/INSERT notifications, window 10 min.
   Sync với NOTIF_DEDUP_WINDOW_MS ở src/config/constants.ts.
   Race-safe qua pg_advisory_xact_lock per dedup key (fix 2026-05-12).';
