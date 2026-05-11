-- create_notifications_batch: public RPC wrapper quanh _create_notifications_dedup.
-- Dùng cho các caller TS chưa migrate sang RPC riêng (notifyPaymentRecorded,
-- notifyTripClosed, notifyJoinResolved cho reject, notifyJoinRequested, etc.).
-- Thay thế body của createNotifications() ở src/services/notification.service.ts.
--
-- Bảo mật: actor_id luôn được force = auth_user_id() — KHÔNG nhận từ client để
-- chống spoofing (user A gửi notif giả danh user B).
--
-- Errors:
--   - not_authenticated (42501): chưa đăng nhập

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM public._create_notifications_dedup(
    p_recipients,
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
$$;

REVOKE ALL ON FUNCTION public.create_notifications_batch(uuid[], text, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_notifications_batch(uuid[], text, uuid, uuid, text, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_notifications_batch IS
  'Atomic batch fan-out notifications với dedup 10 phút. Actor luôn = auth_user_id() (anti-spoof).
   Errors: not_authenticated (42501).';
