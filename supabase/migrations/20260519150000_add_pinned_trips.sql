-- Pinned trips: per-user shortcut tới max 2 trip để truy cập từ home 1-tap.
-- Plan: docs/pinned-trips-plan.md
--
-- Limit + cleanup ghost row enforce qua RPC pin_trip (xem migration 20260519150100).
-- KHÔNG dùng RLS COUNT trong INSERT policy vì sẽ đếm cả ghost row (trip soft-delete
-- hoặc user rời group) → block oan user khi UI chỉ thấy 1 card.
--
-- position smallint (0 hoặc 1): persist thứ tự cho drag-swap. DEFERRED unique để
-- swap atomic trong RPC reorder_pinned_trips không vi phạm tạm thời mid-update.

CREATE TABLE pinned_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position IN (0, 1)),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinned_trips_user_trip_unique UNIQUE (user_id, trip_id),
  CONSTRAINT pinned_trips_user_pos_unique UNIQUE (user_id, position) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE pinned_trips ENABLE ROW LEVEL SECURITY;

-- SELECT/DELETE qua RLS (chính chủ). INSERT/UPDATE bắt buộc qua RPC.
CREATE POLICY "Users read own pins" ON pinned_trips FOR SELECT
  USING (user_id = public.auth_user_id());

CREATE POLICY "Users delete own pins" ON pinned_trips FOR DELETE
  USING (user_id = public.auth_user_id());

-- Block direct INSERT/UPDATE — chỉ RPC SECURITY DEFINER được phép.
REVOKE INSERT, UPDATE ON pinned_trips FROM PUBLIC;
REVOKE INSERT, UPDATE ON pinned_trips FROM authenticated;

COMMENT ON TABLE pinned_trips IS
  'Per-user pinned trips (max 2). INSERT/UPDATE chỉ qua RPC pin_trip/unpin_trip/reorder_pinned_trips. RPC tự cleanup ghost row + enforce limit atomic.';

COMMENT ON COLUMN pinned_trips.position IS
  '0 = card bên trái, 1 = card bên phải. Drag-swap ở home update qua reorder_pinned_trips RPC.';
