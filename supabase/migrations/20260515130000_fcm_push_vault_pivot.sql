-- Pivot _dispatch_push_notification từ `current_setting('app.*')` sang Supabase Vault.
--
-- Vì sao: Supabase managed reject `ALTER DATABASE postgres SET app.*` với
-- `42501: permission denied` ngay cả role `postgres` qua MCP/CLI — restriction
-- platform-level, không bypass được. Vault (`supabase_vault` extension, default
-- installed) là alternative chính thức cho secret storage runtime-readable từ
-- SQL.
--
-- Prerequisites (configure qua Supabase Studio → Vault hoặc SQL):
--   SELECT vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1',
--     'edge_function_url',
--     'Public URL prefix for Edge Functions (FCM dispatcher)'
--   );
--   SELECT vault.create_secret(
--     '<SUPABASE_SERVICE_ROLE_JWT>',
--     'edge_function_token',
--     'Service-role JWT for Edge Function authorization (FCM dispatcher)'
--   );
--
-- 2 tên secret PHẢI khớp chính xác: `edge_function_url` và `edge_function_token`.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public._dispatch_push_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions, vault
AS $$
DECLARE
  v_url   text;
  v_token text;
BEGIN
  -- Đọc từ vault.decrypted_secrets — view chỉ visible cho role có quyền
  -- (postgres + service_role mặc định). SECURITY DEFINER ở đây chạy as
  -- function owner (postgres), nên select ra được giá trị plaintext.
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = 'edge_function_url'
   LIMIT 1;

  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
   WHERE name = 'edge_function_token'
   LIMIT 1;

  IF v_url IS NULL OR v_url = '' OR v_token IS NULL OR v_token = '' THEN
    -- Chưa setup vault → skip silently. Notification vẫn được insert + realtime
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
  'Internal: fire-and-forget POST đến Edge Function send-push qua pg_net. Async, không block. Secrets từ vault.decrypted_secrets (edge_function_url + edge_function_token).';
