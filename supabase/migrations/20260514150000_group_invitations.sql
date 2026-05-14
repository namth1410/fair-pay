-- group_invitations: admin-initiated invitation pending → user accept để trở thành member.
-- Đối xứng với `join_requests` (user-initiated). Mọi mutation qua RPC SECURITY DEFINER.
--
-- Lifecycle: pending → accepted | declined | revoked (terminal).
-- Partial unique index đảm bảo: cùng (group_id, invited_user_id) chỉ có TỐI ĐA 1 invitation pending
-- → admin invite lại sau khi user đã decline/revoke vẫn OK.
--
-- RLS: SELECT cho admin của group + invited user. INSERT/UPDATE chỉ qua RPC (REVOKE PUBLIC).
-- Realtime: thêm vào supabase_realtime publication + REPLICA IDENTITY FULL để client phân biệt
-- được transition status pending → terminal qua payload UPDATE.

CREATE TYPE public.invitation_status AS ENUM
  ('pending', 'accepted', 'declined', 'revoked');

CREATE TABLE public.group_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_email   text NOT NULL,
  invited_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_by      uuid NOT NULL REFERENCES public.users(id),
  status          public.invitation_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz
);

-- Đúng 1 invitation pending per (group, invited_user). Partial unique cho phép invite lại
-- sau khi user decline / admin revoke (record cũ status != 'pending' không vi phạm).
CREATE UNIQUE INDEX group_invitations_unique_pending
  ON public.group_invitations(group_id, invited_user_id)
  WHERE status = 'pending';

CREATE INDEX group_invitations_user_pending_idx
  ON public.group_invitations(invited_user_id, status)
  WHERE status = 'pending';

CREATE INDEX group_invitations_group_status_idx
  ON public.group_invitations(group_id, status, created_at DESC);

ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

-- Admin của group xem được mọi invitation của group đó.
CREATE POLICY admin_select_group_invitations ON public.group_invitations
  FOR SELECT TO authenticated
  USING (public.is_admin(group_id));

-- Invitee xem được invitation của chính mình (bất kể status).
CREATE POLICY invitee_select_own_invitations ON public.group_invitations
  FOR SELECT TO authenticated
  USING (invited_user_id = public.auth_user_id());

-- Không có INSERT/UPDATE/DELETE policy → mọi mutation phải qua RPC SECURITY DEFINER.

-- Realtime publication (idempotent — env có thể đã được cấu hình qua Dashboard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'group_invitations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invitations';
  END IF;
END $$;

-- REPLICA IDENTITY FULL: payload UPDATE chứa đầy đủ cột cũ + mới để client phân biệt
-- được transition `pending → accepted/declined/revoked` và quyết định remove khỏi list.
ALTER TABLE public.group_invitations REPLICA IDENTITY FULL;

COMMENT ON TABLE public.group_invitations IS
  'Admin-initiated invitations chờ user accept. Đối xứng với join_requests (user-initiated).
   Mutations qua RPC: invite_member_by_email, respond_to_invitation, revoke_invitation.';
