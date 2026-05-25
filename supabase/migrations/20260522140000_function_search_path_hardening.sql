-- ============================================================================
-- Migration: Pin search_path cho 3 function thiếu để đồng bộ Supabase Advisor.
-- ============================================================================
-- Pattern: SET search_path = public, pg_temp tránh search_path injection.
-- 3 function này KHÔNG phải SECURITY DEFINER nên risk thực tế thấp, nhưng
-- defense-in-depth + tránh Advisor warning. Idempotent qua CREATE OR REPLACE.
--
-- Định nghĩa function giữ nguyên 100% — chỉ thêm `SET search_path` ở header.
-- Source-of-truth (2 file gốc) đã được sửa đồng bộ trong cùng commit.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. _format_dedup_title (gốc: 20260511160000_notification_internals.sql:40)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._format_dedup_title(
  p_type text,
  p_actor_name text,
  p_count int,
  p_original_title text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_count <= 1 THEN p_original_title
    WHEN p_type = 'expense.created' THEN p_actor_name || ' đã thêm ' || p_count::text || ' khoản chi'
    WHEN p_type = 'expense.edited'  THEN p_actor_name || ' đã sửa '  || p_count::text || ' khoản chi'
    WHEN p_type = 'expense.deleted' THEN p_actor_name || ' đã xóa '  || p_count::text || ' khoản chi'
    ELSE p_original_title
  END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. bump_version_and_updated_at (gốc: 20260521100000_offline_first_version_columns.sql:31)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_version_and_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version
     AND NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. set_updated_at (gốc: 20260521100000_offline_first_version_columns.sql:49)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
