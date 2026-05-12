-- Tighten is_member/is_admin: filter groups.deleted_at IS NULL + group_members.left_at IS NULL.
-- Trước: helpers chỉ join group_members → mutation slip through trên deleted group
-- (admin xóa group; user khác giữ stale state vẫn add expense/trip/payment → orphan data).
--
-- Sau: helpers JOIN groups và chỉ trả TRUE khi group active + member chưa rời.
-- Auto-protect mọi caller: RLS policies (SELECT/INSERT/UPDATE/DELETE), RPCs
-- (create_expense, approve_join_request, clear_trip, delete_trip), TS assertRole
-- (qua RLS trên group_members.SELECT).
--
-- Tightening, không breaking UI: queries hiện đã filter deleted_at ở app layer
-- (fetchMyGroups, fetchTrips, etc.). Helpers chỉ chặn malicious replay / stale state.

CREATE OR REPLACE FUNCTION public.is_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS(
    SELECT 1
      FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
     WHERE gm.group_id = p_group_id
       AND gm.user_id = public.auth_user_id()
       AND gm.left_at IS NULL
       AND g.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS(
    SELECT 1
      FROM public.group_members gm
      JOIN public.groups g ON g.id = gm.group_id
     WHERE gm.group_id = p_group_id
       AND gm.user_id = public.auth_user_id()
       AND gm.role = 'admin'
       AND gm.left_at IS NULL
       AND g.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_member(uuid) IS
  'Trả TRUE nếu caller là active member của group ACTIVE (groups.deleted_at IS NULL).
   Dùng trong RLS + RPC để chặn mọi mutation/select trên deleted group.';

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Trả TRUE nếu caller là admin active của group ACTIVE (groups.deleted_at IS NULL).
   Dùng trong RLS + RPC để chặn admin-only mutation trên deleted group.';
