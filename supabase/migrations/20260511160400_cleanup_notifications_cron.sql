-- Đưa cleanup_notifications() vào IaC + schedule cron daily.
-- CLAUDE.md §3.10: chạy daily 03:00 ICT (UTC+7) = 20:00 UTC ngày hôm trước.
-- TTL: read 30 ngày từ read_at, unread 60 ngày từ created_at.
-- Hằng số TTL ràng buộc với docs/technical-specification.md §6 — sync khi sửa.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE (read_at IS NOT NULL AND read_at    < now() - interval '30 days')
      OR (read_at IS NULL     AND created_at < now() - interval '60 days');
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_notifications() FROM PUBLIC;
COMMENT ON FUNCTION public.cleanup_notifications IS
  'Daily cleanup: xóa notif đã đọc >30 ngày + chưa đọc >60 ngày. Schedule qua pg_cron.';

-- Idempotent schedule: drop job cũ (nếu có) trước khi tạo lại
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_notifications_daily') THEN
    PERFORM cron.unschedule('cleanup_notifications_daily');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup_notifications_daily',
  '0 20 * * *',  -- 20:00 UTC = 03:00 ICT (UTC+7) ngày kế tiếp
  $$SELECT public.cleanup_notifications();$$
);
