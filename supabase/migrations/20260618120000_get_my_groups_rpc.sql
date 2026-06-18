-- get_my_groups: gộp 3 round-trip waterfall của fetchMyGroups (memberships →
-- groups → member counts) thành 1 RPC. Trả groups.* (đủ 10 cột, drop-in cho
-- select('*') cũ) + member_count cho MỌI nhóm mà caller còn là thành viên active.
--
-- Mirror đúng semantics client cũ (src/services/group.service.ts fetchMyGroups):
--   Q1: group_members WHERE user_id = me AND left_at IS NULL        → groupIds
--   Q2: groups WHERE id IN groupIds AND deleted_at IS NULL ORDER BY created_at DESC
--   Q3: group_members WHERE group_id IN groupIds AND left_at IS NULL → count/group
-- member_count đếm cả thành viên ảo (is_virtual) vì chúng cũng là row group_members
-- với left_at IS NULL — khớp hành vi đếm cũ.
--
-- Bảo mật: SECURITY DEFINER (bypass RLS) nhưng EXISTS-filter theo auth_user_id()
-- → chỉ trả nhóm của chính caller, không lộ chéo. STABLE (read-only), KHÔNG throw
-- → rỗng nếu chưa auth / không có nhóm. Tương đương Q1-filter cũ: admin không tự
-- rời nhóm nên membership-active ⊇ created_by-of-mine (RLS cũ OR is_member).

CREATE OR REPLACE FUNCTION public.get_my_groups()
RETURNS TABLE(
  id uuid,
  name text,
  avatar_url text,
  created_by uuid,
  invite_code text,
  created_at timestamptz,
  deleted_at timestamptz,
  version integer,
  updated_at timestamptz,
  client_request_id uuid,
  member_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    g.id,
    g.name,
    g.avatar_url,
    g.created_by,
    g.invite_code,
    g.created_at,
    g.deleted_at,
    g.version,
    g.updated_at,
    g.client_request_id,
    (
      SELECT count(*)
      FROM public.group_members mc
      WHERE mc.group_id = g.id
        AND mc.left_at IS NULL
    ) AS member_count
  FROM public.groups g
  WHERE g.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.group_members me
      WHERE me.group_id = g.id
        AND me.user_id = public.auth_user_id()
        AND me.left_at IS NULL
    )
  ORDER BY g.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_groups() TO authenticated;

COMMENT ON FUNCTION public.get_my_groups IS
  'Trả groups.* (10 cột) + member_count cho các nhóm caller còn active member.
   Gộp 3 round-trip của fetchMyGroups (memberships → groups → counts) thành 1 RPC.
   SECURITY DEFINER nhưng EXISTS-filter theo auth_user_id() → chỉ nhóm của caller.
   STABLE, không throw — rỗng nếu chưa auth/không có nhóm.';
