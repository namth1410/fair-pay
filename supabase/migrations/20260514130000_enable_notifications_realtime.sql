-- Enable Supabase Realtime for `notifications` table.
--
-- Foreground clients subscribe via `supabase.channel(...).on('postgres_changes',
-- { table: 'notifications', filter: 'user_id=eq.<id>' }, ...)` to receive
-- INSERT/UPDATE events in real time. Without this publication membership the
-- server drops realtime events for the table.
--
-- RLS (SELECT chỉ chính chủ — `user_id = auth_user_id()`) is enforced on the
-- realtime stream too, so users only receive their own rows even if a client
-- bypasses the filter.
--
-- REPLICA IDENTITY: default (PK = id UUID) is sufficient for INSERT/UPDATE/DELETE
-- payloads carrying full new row + primary key for old row.
--
-- Idempotent: re-applying on an env that already has the table in the
-- publication is a no-op (some envs were configured via Supabase Dashboard
-- before this migration existed).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;
