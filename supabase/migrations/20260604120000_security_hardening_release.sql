-- ============================================================================
-- Security hardening trước release (2026-06-04)
--
-- Audit phát hiện 4 nhóm vấn đề ở tầng database (chi tiết trong session audit):
--   1. Notification phishing primitive: helper nội bộ (_create_notifications_dedup,
--      _get_group_recipients, _log_action, _dispatch_push_notification) đang GRANT
--      cho anon + authenticated → client gọi thẳng được, spoof actor_id / gửi noti
--      tới user_id bất kỳ. create_notifications_batch không check is_member và
--      không lọc recipients theo nhóm.
--   2. Policy notifications INSERT mở toang (auth.uid() IS NOT NULL) — client không
--      bao giờ insert trực tiếp (chỉ qua RPC definer) nên policy này thừa + nguy hiểm.
--   3. audit_logs INSERT cho phép spoof actor_id (client tự truyền).
--   4. 5 SECURITY DEFINER function thiếu SET search_path + ~19 RPC còn GRANT anon thừa.
--
-- KHÔNG đụng tới is_member / is_admin / auth_user_id grants: chúng được gọi BÊN
-- TRONG các RLS policy nên phải giữ EXECUTE cho anon/authenticated, nếu không mọi
-- query qua RLS sẽ lỗi. Chỉ pin search_path cho chúng.
-- ============================================================================

-- ── 1a. create_notifications_batch: bắt buộc caller là member + lọc recipients ──
-- Recipient hợp lệ = thành viên active của nhóm HOẶC người có join_request với nhóm
-- (giữ được noti member.join_rejected gửi cho người vừa bị từ chối — họ không còn là
-- member nhưng vẫn có row join_requests). Chặn gửi noti tới UUID ngoài nhóm.
CREATE OR REPLACE FUNCTION public.create_notifications_batch(
  p_recipients uuid[],
  p_type text,
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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_recipients uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Chỉ thành viên của nhóm mới được fan-out notification cho nhóm đó.
  IF p_group_id IS NULL OR NOT public.is_member(p_group_id) THEN
    RAISE EXCEPTION 'not_group_member' USING ERRCODE = '42501';
  END IF;

  -- Lọc recipients: chỉ giữ user liên quan tới nhóm (member active hoặc join-requester).
  SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[]::uuid[])
    INTO v_recipients
    FROM unnest(p_recipients) AS uid
   WHERE EXISTS (
           SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = p_group_id
              AND gm.user_id = uid
              AND gm.left_at IS NULL
         )
      OR EXISTS (
           SELECT 1 FROM public.join_requests jr
            WHERE jr.group_id = p_group_id
              AND jr.user_id = uid
         );

  IF array_length(v_recipients, 1) IS NULL THEN
    RETURN;
  END IF;

  PERFORM public._create_notifications_dedup(
    v_recipients,
    p_type,
    v_actor,
    p_group_id,
    p_trip_id,
    p_title,
    p_actor_name,
    p_body,
    COALESCE(p_data, '{}'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.create_notifications_batch(uuid[], text, uuid, uuid, text, text, text, jsonb)
  IS 'Atomic batch notification fan-out. Caller phải là member của p_group_id; '
     'recipients bị lọc về user liên quan nhóm (member active hoặc join-requester). '
     'Errcodes: 42501 (not_authenticated / not_group_member).';

-- ── 1b. Thu hồi grant thừa trên các helper nội bộ ──────────────────────────────
-- Chỉ được gọi từ RPC khác (SECURITY DEFINER, chạy as owner postgres → vẫn gọi được).
REVOKE EXECUTE ON FUNCTION public._create_notifications_dedup(uuid[], text, uuid, uuid, uuid, text, text, text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._get_group_recipients(uuid, text, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._log_action(uuid, uuid, text, uuid, jsonb, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._dispatch_push_notification(uuid) FROM anon, authenticated, PUBLIC;

-- create_notifications_batch: client (authenticated) gọi trực tiếp → giữ authenticated,
-- chỉ thu hồi anon.
REVOKE EXECUTE ON FUNCTION public.create_notifications_batch(uuid[], text, uuid, uuid, text, text, text, jsonb) FROM anon;

-- ── 2. Bỏ policy INSERT notifications mở toang ─────────────────────────────────
-- Client không bao giờ insert trực tiếp (chỉ qua RPC definer). Policy này cho phép
-- bất kỳ user nào chèn noti tới user_id/actor_id bất kỳ → vector phishing.
DROP POLICY IF EXISTS "notif_insert_auth" ON public.notifications;

-- ── 3. Siết policy INSERT audit_logs: ép actor_id = chính caller (chống spoof) ──
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Members can insert own audit logs"
  ON public.audit_logs
  FOR INSERT
  TO public
  WITH CHECK (actor_id = public.auth_user_id());

-- ── 4a. Pin search_path cho 5 SECURITY DEFINER function còn thiếu ──────────────
ALTER FUNCTION public.is_member(uuid)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin(uuid)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_user_id()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()               SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_feedback_daily_limit()  SET search_path = public, pg_temp;

-- ── 4b. Thu hồi anon trên mọi SECURITY DEFINER function (trừ 3 helper dùng trong RLS) ──
-- anon không có nghiệp vụ nào gọi RPC app (anon chỉ dùng cho auth). Giữ is_member /
-- is_admin / auth_user_id để RLS policy đánh giá được.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN ('is_member', 'is_admin', 'auth_user_id')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;
