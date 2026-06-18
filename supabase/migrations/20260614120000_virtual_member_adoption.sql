-- Tính năng: người dùng thật "nhận" (adopt) slot thành viên ảo đã tồn tại.
--
-- Bối cảnh: ban đầu 1 người ghi chi tiêu hộ cả nhóm dưới dạng thành viên ảo
-- (user_id NULL, is_virtual=true). Sau này người đó tải app, tạo tài khoản và muốn
-- nhận lại slot ảo của chính mình để kế thừa toàn bộ số dư/lịch sử.
--
-- Kiến trúc: mọi tham chiếu thành viên (expenses.paid_by, expense_splits.member_id,
-- payments.from/to_member_id, settlements.*, expense_presets.paid_by_member_id) đều trỏ
-- tới group_members.id. Vì vậy chỉ cần BIẾN ĐỔI TẠI CHỖ dòng ảo — gán user_id, set
-- is_virtual=false — là dữ liệu lịch sử tự thuộc về người thật. KHÔNG repoint gì cả.
--
-- Luồng: người join nhập mã → tự chọn "tôi là [ảo X]" (gợi ý lưu ở join_requests.claim_member_id)
-- → admin duyệt, giữ/đổi slot → RPC adoption atomic. Online-only (join_requests không mirror local).

-- ============================================================================
-- 1. Cột gợi ý: người join tự nhận slot ảo nào (admin xác nhận lại khi duyệt)
-- ============================================================================
ALTER TABLE public.join_requests
  ADD COLUMN IF NOT EXISTS claim_member_id uuid NULL
    REFERENCES public.group_members(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. preview_join_by_code: resolve group + danh sách ảo có thể nhận, KHÔNG tạo request.
--    Cho người join chọn danh tính trước khi gửi yêu cầu.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.preview_join_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_group public.groups%ROWTYPE;
  v_existing_active uuid;
  v_members jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF length(v_code) = 0 THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_group
    FROM public.groups
   WHERE invite_code = v_code
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0002';
  END IF;

  -- Đã là active member → không cần xin join
  SELECT id INTO v_existing_active
    FROM public.group_members
   WHERE group_id = v_group.id
     AND user_id = v_actor
     AND left_at IS NULL
   LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0002';
  END IF;

  -- Danh sách ảo có thể nhận: active, chưa gắn user thật
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('id', gm.id, 'display_name', gm.display_name)
             ORDER BY gm.display_name
           ),
           '[]'::jsonb
         )
    INTO v_members
    FROM public.group_members gm
   WHERE gm.group_id = v_group.id
     AND COALESCE(gm.is_virtual, false) = true
     AND gm.user_id IS NULL
     AND gm.left_at IS NULL;

  RETURN jsonb_build_object(
    'group', to_jsonb(v_group),
    'claimable_members', v_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_join_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_join_by_code(text) TO authenticated;

COMMENT ON FUNCTION public.preview_join_by_code IS
  'Resolve group + danh sách thành viên ảo có thể nhận (claimable) theo invite_code, KHÔNG tạo request.
   Bypass RLS để non-member preview. Errors: not_authenticated (42501), invalid_invite_code (P0002), already_member (P0002).';

-- ============================================================================
-- 3. request_join_by_code: thêm tham số p_claim_member_id (gợi ý slot ảo).
--    DROP + CREATE vì đổi signature (chỉ 1 call site TS).
-- ============================================================================
DROP FUNCTION IF EXISTS public.request_join_by_code(text);

CREATE OR REPLACE FUNCTION public.request_join_by_code(
  p_code text,
  p_claim_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_group public.groups%ROWTYPE;
  v_existing_active uuid;
  v_claim_valid uuid;
  v_display_name text;
  v_request_id uuid;
  v_admin_recipients uuid[];
  v_title text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF length(v_code) = 0 THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_group
    FROM public.groups
   WHERE invite_code = v_code
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0002';
  END IF;

  -- Active member: caller đã ở trong nhóm → không cần xin join lại
  SELECT id INTO v_existing_active
    FROM public.group_members
   WHERE group_id = v_group.id
     AND user_id = v_actor
     AND left_at IS NULL
   LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0002';
  END IF;

  -- Validate gợi ý nhận slot ảo (nếu có): phải thuộc nhóm, là ảo active, chưa gắn user.
  IF p_claim_member_id IS NOT NULL THEN
    SELECT id INTO v_claim_valid
      FROM public.group_members
     WHERE id = p_claim_member_id
       AND group_id = v_group.id
       AND COALESCE(is_virtual, false) = true
       AND user_id IS NULL
       AND left_at IS NULL
     LIMIT 1;

    IF v_claim_valid IS NULL THEN
      RAISE EXCEPTION 'member_not_claimable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Fetch display_name cho request (admin sẽ thấy ở danh sách chờ duyệt)
  SELECT display_name INTO v_display_name
    FROM public.users
   WHERE id = v_actor;

  v_display_name := COALESCE(NULLIF(btrim(v_display_name), ''), 'Thành viên');

  -- Upsert: first-time INSERT, rejoin / re-request sau rejection → UPDATE về pending.
  -- ON CONFLICT khớp constraint UNIQUE (group_id, user_id). claim_member_id reset mỗi lần.
  INSERT INTO public.join_requests (
    group_id, user_id, status, display_name, claim_member_id, reviewed_by, reviewed_at, created_at
  )
  VALUES (
    v_group.id, v_actor, 'pending', v_display_name, p_claim_member_id, NULL, NULL, now()
  )
  ON CONFLICT (group_id, user_id) DO UPDATE
     SET status = 'pending',
         display_name = EXCLUDED.display_name,
         claim_member_id = EXCLUDED.claim_member_id,
         reviewed_by = NULL,
         reviewed_at = NULL,
         created_at = now()
  RETURNING id INTO v_request_id;

  -- Notify admins: bypass RLS để fan-out tới user chưa-cùng-nhóm với requester.
  SELECT COALESCE(array_agg(DISTINCT gm.user_id), ARRAY[]::uuid[])
    INTO v_admin_recipients
    FROM public.group_members gm
    JOIN public.users u ON u.id = gm.user_id
   WHERE gm.group_id = v_group.id
     AND gm.role = 'admin'
     AND gm.left_at IS NULL
     AND gm.user_id IS NOT NULL
     AND gm.user_id <> v_actor
     AND COALESCE((u.settings->>'notify_member')::boolean, true) = true;

  IF array_length(v_admin_recipients, 1) IS NOT NULL THEN
    v_title := v_display_name || ' muốn tham gia nhóm ' || v_group.name;
    PERFORM public._create_notifications_dedup(
      v_admin_recipients,
      'member.join_requested',
      v_actor,
      v_group.id,
      NULL,
      btrim(v_title),
      v_display_name,
      NULL,
      jsonb_build_object(
        'group_name', v_group.name,
        'request_id', v_request_id::text
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'requester_name', v_display_name,
    'group', to_jsonb(v_group)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_join_by_code(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_join_by_code(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.request_join_by_code IS
  'Atomic: lookup group by invite_code + active-member check + (optional) validate claim ảo + upsert pending join_request + notify admins.
   p_claim_member_id: gợi ý slot thành viên ảo người join tự nhận (admin xác nhận khi duyệt).
   Errors: not_authenticated (42501), invalid_invite_code (P0002), already_member (P0002), member_not_claimable (P0002).';

-- ============================================================================
-- 4. approve_join_request_as_adoption: duyệt yêu cầu BẰNG CÁCH gán người join vào
--    slot thành viên ảo (biến đổi tại chỗ). Song song approve_join_request cũ.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_join_request_as_adoption(
  p_request_id uuid,
  p_group_id uuid,
  p_group_name text,
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_requester_user uuid;
  v_existing_any uuid;
  v_old_virtual_name text;
  v_profile_name text;
  v_new_name text;
  v_notify_enabled boolean;
  v_title text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Fetch request (pending, đúng nhóm) → requester
  SELECT user_id
    INTO v_requester_user
    FROM public.join_requests
   WHERE id = p_request_id
     AND group_id = p_group_id
     AND status = 'pending';

  IF v_requester_user IS NULL THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Chặn requester đã/từng có membership (kể cả left_at) — sẽ vi phạm UNIQUE(group_id,user_id).
  -- Admin nên dùng duyệt thường (tự xử lý rejoin) cho trường hợp này.
  SELECT id INTO v_existing_any
    FROM public.group_members
   WHERE group_id = p_group_id
     AND user_id = v_requester_user
   LIMIT 1;

  IF v_existing_any IS NOT NULL THEN
    RAISE EXCEPTION 'cannot_adopt_existing_member' USING ERRCODE = 'P0001';
  END IF;

  -- Validate + lock slot ảo: thuộc nhóm, là ảo, active, chưa gắn user.
  SELECT display_name
    INTO v_old_virtual_name
    FROM public.group_members
   WHERE id = p_member_id
     AND group_id = p_group_id
     AND COALESCE(is_virtual, false) = true
     AND user_id IS NULL
     AND left_at IS NULL
   FOR UPDATE;

  IF v_old_virtual_name IS NULL THEN
    RAISE EXCEPTION 'member_not_claimable' USING ERRCODE = 'P0002';
  END IF;

  -- Tên mới = tên hồ sơ người thật (fallback giữ tên ảo nếu rỗng).
  SELECT display_name INTO v_profile_name
    FROM public.users
   WHERE id = v_requester_user;

  v_new_name := COALESCE(NULLIF(btrim(v_profile_name), ''), v_old_virtual_name);

  -- Adopt tại chỗ: trigger bump_version_and_updated_at tự bump version + updated_at.
  -- Bọc unique_violation: race hiếm khi admin khác chạy approve_join_request thường
  -- (INSERT member cho cùng requester) chen giữa pre-check và UPDATE → 23505. Đổi sang
  -- lỗi thân thiện đã map thay vì rò lỗi kỹ thuật ra UI.
  BEGIN
    UPDATE public.group_members
       SET user_id = v_requester_user,
           is_virtual = false,
           display_name = v_new_name
     WHERE id = p_member_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'cannot_adopt_existing_member' USING ERRCODE = 'P0001';
  END;

  -- Update status (double-check pending chống double-fire 2 admin)
  UPDATE public.join_requests
     SET status = 'approved',
         reviewed_by = v_actor,
         reviewed_at = now()
   WHERE id = p_request_id
     AND group_id = p_group_id
     AND status = 'pending';

  -- Audit
  PERFORM public._log_action(
    p_group_id,
    NULL,
    'member.virtual_replaced',
    p_member_id,
    jsonb_build_object('display_name', v_old_virtual_name, 'is_virtual', true),
    jsonb_build_object('user_id', v_requester_user::text, 'display_name', v_new_name)
  );

  -- Notify requester nếu họ bật notify_member (mặc định true).
  IF v_requester_user <> v_actor THEN
    SELECT COALESCE((u.settings->>'notify_member')::boolean, true)
      INTO v_notify_enabled
      FROM public.users u
     WHERE u.id = v_requester_user;

    IF v_notify_enabled THEN
      v_title := 'Bạn đã được duyệt vào nhóm ' || COALESCE(p_group_name, '');
      INSERT INTO public.notifications (
        user_id, group_id, trip_id, type, actor_id, title, body, data
      )
      VALUES (
        v_requester_user,
        p_group_id,
        NULL,
        'member.join_approved',
        v_actor,
        btrim(v_title),
        NULL,
        jsonb_build_object(
          'count', 1,
          'target_ids', '[]'::jsonb,
          'group_name', COALESCE(p_group_name, '')
        )
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request_as_adoption(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request_as_adoption(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.approve_join_request_as_adoption IS
  'Atomic: duyệt join request bằng cách gán requester vào slot thành viên ảo (user_id + is_virtual=false + tên hồ sơ)
   + update request status + audit (member.virtual_replaced) + notify requester. Admin only.
   Errors: not_authorized (42501), request_not_found (P0002), cannot_adopt_existing_member (P0001), member_not_claimable (P0002).';
