-- get_my_pending_join_requests: trả về các join_request status='pending' của caller,
-- kèm group name để render ribbon "ĐANG CHỜ DUYỆT" ở Home.
--
-- Lý do tồn tại: user có pending request CHƯA phải member nên RLS trên `groups`
-- chặn SELECT name → client không thể join 2 bảng. RPC SECURITY DEFINER lấy hộ.
-- Ribbon ở Home persist qua logout/login chỉ bằng cách fetch server-side mỗi lần
-- mount (state ephemeral local sẽ mất khi unmount).
--
-- KHÔNG có error: trả mảng rỗng nếu chưa auth hoặc không có request nào.

CREATE OR REPLACE FUNCTION public.get_my_pending_join_requests()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'request_id', jr.id,
        'group_id',   jr.group_id,
        'group_name', g.name,
        'created_at', jr.created_at
      )
      ORDER BY jr.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.join_requests jr
  JOIN public.groups g ON g.id = jr.group_id
  WHERE jr.user_id = public.auth_user_id()
    AND jr.status = 'pending'
    AND g.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_pending_join_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_join_requests() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_join_requests IS
  'Trả jsonb array các pending join_request của caller (kèm group_name).
   Bypass RLS để non-member resolve được group_name. Không throw — trả [] nếu chưa auth.';
