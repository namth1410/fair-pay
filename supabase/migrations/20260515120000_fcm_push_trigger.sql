-- FCM push notification dispatcher: trigger AFTER INSERT/UPDATE on notifications
-- → call Edge Function `send-push` via pg_net (async, non-blocking).
--
-- Dedup UPDATE case: `_create_notifications_dedup` có thể UPDATE row cũ thay
-- vì INSERT mới (push thêm target_ids, tăng `data->>count`). Cần fire push
-- lại để client nhận title cập nhật "{Actor} đã thêm 3 khoản chi".
--
-- Async via pg_net: nếu Edge Function fail/slow, transaction insert KHÔNG bị
-- block — accept eventual consistency (in-app notification vẫn hiện khi user
-- mở app qua realtime channel).
--
-- ⚠️ SUPERSEDED: `_dispatch_push_notification` body trong file này dùng
-- `current_setting('app.*')` — KHÔNG hoạt động trên Supabase managed (ALTER
-- DATABASE/ROLE SET app.* bị 42501 permission denied). File 20260515130000_fcm_push_vault_pivot.sql
-- CREATE OR REPLACE function này để đọc từ vault.decrypted_secrets thay vì
-- current_setting. Migration history giữ nguyên để truy vết, nhưng RUNTIME
-- function body là phiên bản vault.
--
-- Prerequisites (configure qua Supabase Studio → Vault hoặc SQL):
--   1. supabase secrets set FIREBASE_SERVICE_ACCOUNT='<json>'  (Edge Function secret)
--   2. SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_function_url', ...);
--   3. SELECT vault.create_secret('<service-role-jwt>', 'edge_function_token', ...);
--   4. supabase functions deploy send-push

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Dispatcher function: fire-and-forget HTTP POST. Lỗi của pg_net.http_post
-- (URL không config, network fail) bị nuốt qua exception handler — KHÔNG
-- block notification insert.
CREATE OR REPLACE FUNCTION public._dispatch_push_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
DECLARE
  v_url   text;
  v_token text;
BEGIN
  -- current_setting với missing_ok=true → trả empty string nếu chưa set, không throw.
  v_url   := current_setting('app.edge_function_url',   true);
  v_token := current_setting('app.edge_function_token', true);

  IF v_url IS NULL OR v_url = '' OR v_token IS NULL OR v_token = '' THEN
    -- Chưa config → skip silently. Notification vẫn được insert + realtime
    -- vẫn fire. Không raise warning mỗi insert (spam log).
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := jsonb_build_object('notification_id', p_notification_id)
  );
EXCEPTION WHEN OTHERS THEN
  -- Defensive: pg_net errors KHÔNG bao giờ block insert transaction.
  RAISE WARNING '[fcm push] dispatch failed for notification %: %', p_notification_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public._dispatch_push_notification(uuid) FROM PUBLIC;
COMMENT ON FUNCTION public._dispatch_push_notification IS
  'Internal: fire-and-forget POST đến Edge Function send-push qua pg_net. Async, không block.';

-- Trigger function: extract id từ NEW row, gọi dispatcher.
-- Tách INSERT vs UPDATE handler để UPDATE chỉ fire khi `count` thay đổi
-- (tránh push lại khi mark-as-read update read_at).
CREATE OR REPLACE FUNCTION public._on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._dispatch_push_notification(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._on_notification_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Chỉ fire khi dedup-count thay đổi (notification được merge), KHÔNG fire
  -- khi user mark-as-read (read_at thay đổi) hoặc các UPDATE khác.
  IF (OLD.data->>'count') IS DISTINCT FROM (NEW.data->>'count') THEN
    PERFORM public._dispatch_push_notification(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_fcm_insert ON public.notifications;
CREATE TRIGGER notifications_fcm_insert
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public._on_notification_insert();

DROP TRIGGER IF EXISTS notifications_fcm_update ON public.notifications;
CREATE TRIGGER notifications_fcm_update
AFTER UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public._on_notification_update();
