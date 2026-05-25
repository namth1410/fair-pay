-- Optimistic concurrency RPCs cho offline-first.
--
-- 5 RPC update state edit + 4 RPC state machine / idempotent:
--   - update_group, update_trip_name, update_member_display_name,
--     update_user_display_name, update_preset
--   - close_trip, reopen_trip, update_user_settings, delete_payment
--
-- Pattern chung:
--   1. assertAuthorized (auth_user_id() + is_admin/owner)
--   2. Fetch current version + state
--   3. Check version match → mismatch → RAISE P0410 (conflict)
--   4. UPDATE (trigger bump_version_and_updated_at tự tăng version + updated_at)
--   5. Inline audit log + notify (atomic, không depend client-side replay)
--   6. RETURN row mới với version+updated_at để client cập nhật local mirror
--
-- Idempotency cho UPDATE RPCs: client tự handle false-positive conflict
--   - Khi nhận P0410, client fetch server state.
--   - Nếu server state == intended state → recognize as retry success.
--   - Nếu khác → real conflict, show modal.
-- → Không cần idempotency_log table; tránh thêm storage overhead.

-- ============================================================================
-- 1. update_group: rename + change avatar_url (admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_group(
  p_group_id uuid,
  p_name text,
  p_avatar_url text,
  p_base_version integer,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, version integer, name text, avatar_url text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_current_version integer;
  v_old_name text;
  v_old_avatar text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT g.version, g.name, g.avatar_url
    INTO v_current_version, v_old_name, v_old_avatar
    FROM public.groups g
   WHERE g.id = p_group_id AND g.deleted_at IS NULL;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'group_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict'
      USING ERRCODE = 'P0410',
            DETAIL = format('expected version %s, current %s', p_base_version, v_current_version);
  END IF;

  UPDATE public.groups
     SET name = COALESCE(p_name, name),
         avatar_url = CASE WHEN p_avatar_url = '' THEN NULL ELSE COALESCE(p_avatar_url, avatar_url) END
   WHERE id = p_group_id;

  -- Audit (im lặng nếu chỉ avatar thay đổi)
  IF p_name IS NOT NULL AND p_name <> v_old_name THEN
    INSERT INTO public.audit_logs (group_id, action, actor_id, target_id, before_data, after_data, client_created_at)
    VALUES (p_group_id, 'group.rename', v_actor, p_group_id,
            jsonb_build_object('name', v_old_name),
            jsonb_build_object('name', p_name),
            p_client_created_at);
  END IF;

  RETURN QUERY
    SELECT g.id, g.version, g.name, g.avatar_url, g.updated_at
      FROM public.groups g WHERE g.id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_group(uuid, text, text, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_group(uuid, text, text, integer, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.update_group IS
  'Atomic: rename + change avatar. Admin only. Optimistic concurrency qua p_base_version. Errors: unauthorized (42501), not_admin (42501), group_not_found (P0002), version_conflict (P0410).';

-- ============================================================================
-- 2. update_trip_name (admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_trip_name(
  p_trip_id uuid,
  p_name text,
  p_base_version integer,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, version integer, name text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_current_version integer;
  v_old_name text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT t.group_id, t.version, t.name
    INTO v_group_id, v_current_version, v_old_name
    FROM public.trips t
   WHERE t.id = p_trip_id AND t.deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.trips SET name = p_name WHERE id = p_trip_id;

  IF p_name <> v_old_name THEN
    INSERT INTO public.audit_logs (group_id, trip_id, action, actor_id, target_id, before_data, after_data, client_created_at)
    VALUES (v_group_id, p_trip_id, 'trip.rename', v_actor, p_trip_id,
            jsonb_build_object('name', v_old_name),
            jsonb_build_object('name', p_name),
            p_client_created_at);
  END IF;

  RETURN QUERY
    SELECT t.id, t.version, t.name, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_trip_name(uuid, text, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_trip_name(uuid, text, integer, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.update_trip_name IS
  'Atomic trip rename. Admin only. Errors: unauthorized, trip_not_found (P0002), not_admin (42501), version_conflict (P0410).';

-- ============================================================================
-- 3. update_member_display_name (admin only — rename member trong group)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_member_display_name(
  p_member_id uuid,
  p_display_name text,
  p_base_version integer,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, version integer, display_name text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_current_version integer;
  v_old_name text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT m.group_id, m.version, m.display_name
    INTO v_group_id, v_current_version, v_old_name
    FROM public.group_members m
   WHERE m.id = p_member_id AND m.left_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.group_members SET display_name = p_display_name WHERE id = p_member_id;

  IF p_display_name <> v_old_name THEN
    INSERT INTO public.audit_logs (group_id, action, actor_id, target_id, before_data, after_data, client_created_at)
    VALUES (v_group_id, 'member.rename', v_actor, p_member_id,
            jsonb_build_object('display_name', v_old_name),
            jsonb_build_object('display_name', p_display_name),
            p_client_created_at);
  END IF;

  RETURN QUERY
    SELECT m.id, m.version, m.display_name, m.updated_at
      FROM public.group_members m WHERE m.id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_display_name(uuid, text, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_member_display_name(uuid, text, integer, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.update_member_display_name IS
  'Atomic member rename. Admin only. Errors: unauthorized, member_not_found, not_admin, version_conflict.';

-- ============================================================================
-- 4. update_user_display_name (self only — đổi tên hiển thị của chính mình)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_user_display_name(
  p_display_name text,
  p_base_version integer,
  p_client_request_id uuid
)
RETURNS TABLE(id uuid, version integer, display_name text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_current_version integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT u.version INTO v_current_version
    FROM public.users u WHERE u.id = v_actor;

  IF v_current_version IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.users SET display_name = p_display_name WHERE id = v_actor;

  RETURN QUERY
    SELECT u.id, u.version, u.display_name, u.updated_at
      FROM public.users u WHERE u.id = v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_display_name(text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_display_name(text, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_user_display_name IS
  'Update own display_name. Errors: unauthorized, user_not_found, version_conflict.';

-- ============================================================================
-- 5. update_preset (owner only — full payload update)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_preset(
  p_preset_id uuid,
  p_title text,
  p_amount integer,
  p_category text,
  p_trip_id uuid,
  p_paid_by_member_id uuid,
  p_split_type text,
  p_splits_data jsonb,
  p_base_version integer,
  p_client_request_id uuid
)
RETURNS TABLE(
  id uuid, version integer, title text, amount integer, category text,
  trip_id uuid, paid_by_member_id uuid, split_type text, splits_data jsonb,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_owner uuid;
  v_current_version integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.user_id, p.version
    INTO v_owner, v_current_version
    FROM public.expense_presets p
   WHERE p.id = p_preset_id AND p.deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'preset_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_actor THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.expense_presets
     SET title = p_title,
         amount = p_amount,
         category = p_category,
         trip_id = p_trip_id,
         paid_by_member_id = p_paid_by_member_id,
         split_type = p_split_type,
         splits_data = p_splits_data
   WHERE id = p_preset_id;

  RETURN QUERY
    SELECT p.id, p.version, p.title, p.amount, p.category,
           p.trip_id, p.paid_by_member_id, p.split_type, p.splits_data,
           p.updated_at
      FROM public.expense_presets p WHERE p.id = p_preset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_preset(uuid, text, integer, text, uuid, uuid, text, jsonb, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_preset(uuid, text, integer, text, uuid, uuid, text, jsonb, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_preset IS
  'Update full preset payload. Owner only. Errors: unauthorized, preset_not_found, not_owner, version_conflict.';

-- ============================================================================
-- 6. close_trip (admin only — state machine, version-based)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close_trip(
  p_trip_id uuid,
  p_base_version integer,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, version integer, status text, closed_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_current_version integer;
  v_current_status text;
  v_name text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT t.group_id, t.version, t.status, t.name
    INTO v_group_id, v_current_version, v_current_status, v_name
    FROM public.trips t WHERE t.id = p_trip_id AND t.deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  -- Idempotent state machine: nếu đã closed → no-op (return current state).
  -- Không check version vì close là explicit action, replay an toàn.
  IF v_current_status = 'closed' THEN
    RETURN QUERY
      SELECT t.id, t.version, t.status, t.closed_at, t.updated_at
        FROM public.trips t WHERE t.id = p_trip_id;
    RETURN;
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.trips SET status = 'closed', closed_at = now() WHERE id = p_trip_id;

  INSERT INTO public.audit_logs (group_id, trip_id, action, actor_id, target_id, before_data, after_data, client_created_at)
  VALUES (v_group_id, p_trip_id, 'trip.close', v_actor, p_trip_id,
          jsonb_build_object('name', v_name, 'status', 'open'),
          jsonb_build_object('status', 'closed'),
          p_client_created_at);

  RETURN QUERY
    SELECT t.id, t.version, t.status, t.closed_at, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.close_trip(uuid, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_trip(uuid, integer, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.close_trip IS
  'Close trip. Admin only. Idempotent (no-op if already closed). Errors: unauthorized, trip_not_found, not_admin, version_conflict.';

-- ============================================================================
-- 7. reopen_trip (admin only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reopen_trip(
  p_trip_id uuid,
  p_base_version integer,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, version integer, status text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_current_version integer;
  v_current_status text;
  v_name text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT t.group_id, t.version, t.status, t.name
    INTO v_group_id, v_current_version, v_current_status, v_name
    FROM public.trips t WHERE t.id = p_trip_id AND t.deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF v_current_status = 'open' THEN
    RETURN QUERY
      SELECT t.id, t.version, t.status, t.updated_at
        FROM public.trips t WHERE t.id = p_trip_id;
    RETURN;
  END IF;

  IF v_current_version <> p_base_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0410';
  END IF;

  UPDATE public.trips SET status = 'open', closed_at = NULL WHERE id = p_trip_id;

  INSERT INTO public.audit_logs (group_id, trip_id, action, actor_id, target_id, before_data, after_data, client_created_at)
  VALUES (v_group_id, p_trip_id, 'trip.reopen', v_actor, p_trip_id,
          jsonb_build_object('name', v_name, 'status', 'closed'),
          jsonb_build_object('status', 'open'),
          p_client_created_at);

  RETURN QUERY
    SELECT t.id, t.version, t.status, t.updated_at
      FROM public.trips t WHERE t.id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_trip(uuid, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_trip(uuid, integer, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.reopen_trip IS
  'Reopen closed trip. Admin only. Idempotent (no-op if already open). Errors: unauthorized, trip_not_found, not_admin, version_conflict.';

-- ============================================================================
-- 8. update_user_settings (self only — LWW theo updated_at, không dùng version)
-- ============================================================================

-- LWW pattern: client gửi p_base_updated_at = last seen server timestamp.
-- Server check: nếu users.updated_at > p_base_updated_at → "stale" base, conflict.
-- Khác update_user_display_name dùng version (counter) vì settings phù hợp với
-- LWW timestamp (user hiếm khi đổi 2 lần trong cùng giây).

CREATE OR REPLACE FUNCTION public.update_user_settings(
  p_settings jsonb,
  p_base_updated_at timestamptz,
  p_client_request_id uuid
)
RETURNS TABLE(id uuid, version integer, settings jsonb, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_current_updated_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT u.updated_at INTO v_current_updated_at
    FROM public.users u WHERE u.id = v_actor;

  IF v_current_updated_at IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- LWW conflict: server đã có update mới hơn → caller cần merge và resubmit.
  -- Cho phép tolerance 1ms vì timestamp round-trip có thể lệch microsecond.
  IF v_current_updated_at > p_base_updated_at + interval '1 millisecond' THEN
    RAISE EXCEPTION 'lww_stale' USING ERRCODE = 'P0410',
      DETAIL = format('server updated_at %s > client base %s', v_current_updated_at, p_base_updated_at);
  END IF;

  UPDATE public.users SET settings = p_settings WHERE id = v_actor;

  RETURN QUERY
    SELECT u.id, u.version, u.settings, u.updated_at
      FROM public.users u WHERE u.id = v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_settings(jsonb, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_settings(jsonb, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_user_settings IS
  'LWW update settings jsonb. p_base_updated_at = last seen server timestamp. Errors: unauthorized, user_not_found, lww_stale (P0410).';

-- ============================================================================
-- 9. delete_payment (recorder only — soft-delete idempotent, KHÔNG cần version)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_payment(
  p_payment_id uuid,
  p_client_request_id uuid,
  p_client_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, deleted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_group_id uuid;
  v_trip_id uuid;
  v_recorded_by uuid;
  v_current_deleted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.group_id, p.trip_id, p.recorded_by, p.deleted_at
    INTO v_group_id, v_trip_id, v_recorded_by, v_current_deleted_at
    FROM public.payments p WHERE p.id = p_payment_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Recorder OR admin
  IF v_recorded_by <> v_actor AND NOT public.is_admin(v_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: COALESCE giữ deleted_at nếu đã set
  UPDATE public.payments
     SET deleted_at = COALESCE(deleted_at, now())
   WHERE id = p_payment_id;

  -- Audit chỉ insert nếu lần đầu xóa (current_deleted_at IS NULL)
  IF v_current_deleted_at IS NULL THEN
    INSERT INTO public.audit_logs (group_id, trip_id, action, actor_id, target_id, before_data, after_data, client_created_at)
    VALUES (v_group_id, v_trip_id, 'payment.delete', v_actor, p_payment_id, NULL, NULL, p_client_created_at);
  END IF;

  RETURN QUERY
    SELECT p.id, p.deleted_at FROM public.payments p WHERE p.id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payment(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_payment(uuid, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.delete_payment IS
  'Soft-delete payment idempotent (COALESCE). Recorder hoặc admin. Errors: unauthorized, payment_not_found, not_authorized.';
