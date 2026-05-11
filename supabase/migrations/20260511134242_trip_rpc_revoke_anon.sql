-- Supabase mặc định grant EXECUTE cho `anon` khi tạo function — REVOKE explicit.
-- Function vẫn an toàn dù anon gọi (is_admin sẽ false) nhưng defense-in-depth.
REVOKE EXECUTE ON FUNCTION public.clear_trip(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_trip(uuid) FROM anon;
