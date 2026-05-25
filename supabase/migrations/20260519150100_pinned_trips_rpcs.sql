-- Pinned trips RPCs: pin_trip, unpin_trip, reorder_pinned_trips
-- Plan: docs/pinned-trips-plan.md
--
-- Pattern: SECURITY DEFINER + SET search_path = public, pg_temp.
-- Actor = auth_user_id() (chống spoof từ client).
-- REVOKE PUBLIC + GRANT authenticated.

-- ──────────────────────────────────────────────────────────────────────────────
-- pin_trip: cleanup ghost rows → idempotent → validate membership → check limit → INSERT
--
-- Errors:
--   42501 — not authenticated / forbidden (không phải member)
--   P0001 'max_pinned_reached' — đã ghim đủ 2 chuyến
--   23505 — race condition (UNIQUE constraint) — hiếm vì idempotent early-return
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pin_trip(p_trip_id uuid)
RETURNS public.pinned_trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.auth_user_id();
  v_row public.pinned_trips;
  v_next_pos smallint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Self-cleanup ghost rows (trip soft/hard deleted, user rời group).
  -- Quan trọng: tránh COUNT đếm cả ghost row → block oan user khi UI chỉ thấy ít hơn.
  DELETE FROM public.pinned_trips p
   WHERE p.user_id = v_uid
     AND (
       NOT EXISTS (
         SELECT 1 FROM public.trips t
         WHERE t.id = p.trip_id AND t.deleted_at IS NULL
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.trips t
         JOIN public.group_members gm ON gm.group_id = t.group_id
         WHERE t.id = p.trip_id
           AND gm.user_id = v_uid
           AND gm.left_at IS NULL
       )
     );

  -- Idempotent: nếu đã pin trip này thì trả row hiện tại, không lỗi.
  SELECT * INTO v_row FROM public.pinned_trips
   WHERE user_id = v_uid AND trip_id = p_trip_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Validate trip còn sống + user là member còn active.
  IF NOT EXISTS (
    SELECT 1 FROM public.trips t
    JOIN public.group_members gm ON gm.group_id = t.group_id
    WHERE t.id = p_trip_id
      AND t.deleted_at IS NULL
      AND gm.user_id = v_uid
      AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Check limit (sau cleanup ghost nên không bị false positive).
  IF (SELECT COUNT(*) FROM public.pinned_trips WHERE user_id = v_uid) >= 2 THEN
    RAISE EXCEPTION 'max_pinned_reached' USING ERRCODE = 'P0001';
  END IF;

  -- Next free position: 0 nếu trống, ngược lại 1.
  v_next_pos := CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.pinned_trips
       WHERE user_id = v_uid AND position = 0
    ) THEN 0::smallint
    ELSE 1::smallint
  END;

  INSERT INTO public.pinned_trips (user_id, trip_id, position)
       VALUES (v_uid, p_trip_id, v_next_pos)
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pin_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pin_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.pin_trip(uuid) IS
  'Atomic pin: cleanup ghost rows + idempotent check + validate membership + check limit + assign next free position. Errors: 42501 (forbidden/no auth), P0001 max_pinned_reached.';


-- ──────────────────────────────────────────────────────────────────────────────
-- unpin_trip: DELETE + compact pin còn lại về position 0 (nếu nó đang ở 1)
-- Idempotent: không lỗi nếu chưa pin.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unpin_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.auth_user_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pinned_trips
   WHERE user_id = v_uid AND trip_id = p_trip_id;

  -- Compact: nếu pin còn lại đang ở position 1 và position 0 trống → đẩy về 0.
  UPDATE public.pinned_trips SET position = 0
   WHERE user_id = v_uid
     AND position = 1
     AND NOT EXISTS (
       SELECT 1 FROM public.pinned_trips p2
       WHERE p2.user_id = v_uid AND p2.position = 0
     );
END;
$$;

REVOKE ALL ON FUNCTION public.unpin_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unpin_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.unpin_trip(uuid) IS
  'Idempotent unpin: DELETE row + compact pin còn lại về position 0. Không lỗi nếu trip chưa pin.';


-- ──────────────────────────────────────────────────────────────────────────────
-- reorder_pinned_trips: swap position của 2 pin atomic
-- Input: array 2 trip_id theo thứ tự mong muốn [pos0, pos1].
-- Errors:
--   42501 — auth / không phải pin của user
--   22023 — input không đúng format (cần đúng 2 ids)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_pinned_trips(p_trip_ids uuid[])
RETURNS SETOF public.pinned_trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.auth_user_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF coalesce(array_length(p_trip_ids, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'reorder requires exactly 2 trip ids' USING ERRCODE = '22023';
  END IF;

  IF p_trip_ids[1] = p_trip_ids[2] THEN
    RAISE EXCEPTION 'reorder requires 2 distinct trip ids' USING ERRCODE = '22023';
  END IF;

  -- Cả 2 phải là pin hiện hữu của user.
  IF (
    SELECT COUNT(*) FROM public.pinned_trips
     WHERE user_id = v_uid AND trip_id = ANY(p_trip_ids)
  ) <> 2 THEN
    RAISE EXCEPTION 'pin not found' USING ERRCODE = '42501';
  END IF;

  -- Single UPDATE statement với CTE-style join.
  -- UNIQUE(user_id, position) DEFERRABLE INITIALLY DEFERRED → constraint check
  -- ở commit, không vi phạm khi 2 row tạm thời ở cùng pos mid-update.
  UPDATE public.pinned_trips p
     SET position = np.new_pos
    FROM (
      VALUES
        (p_trip_ids[1], 0::smallint),
        (p_trip_ids[2], 1::smallint)
    ) AS np(trip_id, new_pos)
   WHERE p.user_id = v_uid
     AND p.trip_id = np.trip_id;

  RETURN QUERY
    SELECT * FROM public.pinned_trips
     WHERE user_id = v_uid
     ORDER BY position;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_pinned_trips(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_pinned_trips(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_pinned_trips(uuid[]) IS
  'Swap position của 2 pin. Input array 2 trip_id theo thứ tự mới [pos0, pos1]. Atomic qua DEFERRED unique constraint. Errors: 42501 (auth/not-found), 22023 (cần đúng 2 ids distinct).';
