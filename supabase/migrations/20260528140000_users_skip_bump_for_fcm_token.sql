-- ============================================================================
-- Migration: Trigger riêng cho `public.users` skip bump version+updated_at
--            khi chỉ `fcm_token` đổi.
-- ============================================================================
-- Bug:
--   `updateFcmToken` ở [user.service.ts] chạy direct UPDATE users SET fcm_token.
--   Trigger `trg_users_bump_version` (dùng shared func `bump_version_and_updated_at`)
--   tự bump `version + 1` và `updated_at := now()` cho mọi UPDATE, kể cả khi
--   chỉ thay fcm_token.
--   → Local SQLite mirror không sync kịp → lần `updateSettings` kế tiếp gửi
--     `p_base_updated_at` stale → RPC throw `lww_stale` (P0410) → toast "Lỗi"
--     khi user toggle setting.
--   → Cùng vấn đề với `update_user_display_name` (P3 base_version check) —
--     bug ẩn, chưa fire trong logs nhưng cùng cơ chế.
--
-- Tại sao fcm_token KHÔNG cần bump version/updated_at:
--   1. `users.version` chỉ là input cho `update_user_display_name` P3 check.
--      Audit code (5/2026): không có analytics / cron / realtime / cross-device
--      logic nào dựa vào version progression của user.
--   2. `users.updated_at` chỉ dùng cho `update_user_settings` P5 check + pull
--      watermark. fcm_token là device-local (1 user / 1 token, device-bound),
--      không cần cross-device propagation qua pull.
--
-- Fix:
--   Tách trigger riêng cho `public.users` (`bump_version_users`) để thêm điều
--   kiện skip bump khi tất cả cột "logical" giống OLD (chỉ fcm_token đổi).
--   10 bảng còn lại vẫn dùng shared func cũ — KHÔNG thay đổi semantics.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bump_version_users()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Short-circuit nếu caller (RPC) đã set new version + updated_at — giữ
  -- nguyên semantics shared func: caller override được trigger.
  IF NEW.version IS DISTINCT FROM OLD.version
     AND NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;

  -- Skip bump nếu chỉ fcm_token (hoặc các cột không-logical) đổi.
  -- Check 5 cột logical: display_name, photo_url, settings, email, auth_id.
  -- Nếu cả 5 NOT DISTINCT từ OLD → đây là fcm_token update → no bump.
  IF OLD.display_name IS NOT DISTINCT FROM NEW.display_name
     AND OLD.photo_url IS NOT DISTINCT FROM NEW.photo_url
     AND OLD.settings IS NOT DISTINCT FROM NEW.settings
     AND OLD.email IS NOT DISTINCT FROM NEW.email
     AND OLD.auth_id IS NOT DISTINCT FROM NEW.auth_id THEN
    RETURN NEW;
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_version_users IS
  'Trigger function cho public.users BEFORE UPDATE. Bump version+updated_at trừ khi: (a) caller đã set new version+updated_at (RPC override), hoặc (b) chỉ fcm_token đổi (device-local field, không cần optimistic concurrency).';

-- Swap trigger sang func mới (10 bảng khác vẫn dùng shared bump_version_and_updated_at).
DROP TRIGGER IF EXISTS trg_users_bump_version ON public.users;
CREATE TRIGGER trg_users_bump_version
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_version_users();
