-- Nâng giới hạn ghim chuyến đi 2 → 20. Home mới (giao diện "Hội thoại" 2026-10) hiện
-- chuyến ghim thành hàng "story" cuộn ngang nên không còn bó ở 2 card trái/phải.
--
-- Thay đổi:
--   1. CHECK position IN (0, 1) → position >= 0. Thứ tự 0..n-1, 0 = đầu hàng.
--      Giới hạn số pin enforce trong RPC pin_trip (như cũ), KHÔNG ở CHECK.
--   2. pin_trip: tối đa 20; chuyến vừa ghim lên ĐẦU hàng (position 0, pin cũ dời +1) —
--      kiểu ghim chat của Telegram/WhatsApp, vừa ghim là thấy ngay. Đồng thời dồn position
--      liền mạch (dọn ghost row để lại lỗ hổng).
--   3. unpin_trip: xoá + dồn các pin còn lại về 0..n-1 (trước: chỉ dồn 1 → 0).
--   4. reorder_pinned_trips: nhận >= 2 trip_id khác nhau (trước: đúng 2). Hoán vị các id
--      được liệt kê TRONG CHÍNH các slot chúng đang chiếm, pin không liệt kê giữ nguyên chỗ →
--      tương thích ngược client cũ (web + app bản cũ) gửi [pos0, pos1] để đổi chỗ 2 card.
--
-- Cả 3 RPC lấy advisory lock theo user → pin/unpin/reorder đồng thời từ 2 thiết bị chạy
-- tuần tự (dời position nhiều row không đua nhau ra 23505).
-- UNIQUE (user_id, position) DEFERRABLE INITIALLY DEFERRED giữ nguyên: các UPDATE dời/hoán
-- vị chỉ bị check lúc commit. Mỗi UPDATE position bump updated_at qua trigger
-- set_updated_at → delta pull thiết bị khác nhận thứ tự mới; chỉ UPDATE row thật sự đổi
-- position (IS DISTINCT FROM) để đỡ churn.
--
-- Client: MAX_PINNED_TRIPS ở src/config/constants.ts PHẢI đồng bộ với số 20 dưới đây.

ALTER TABLE public.pinned_trips DROP CONSTRAINT pinned_trips_position_check;
ALTER TABLE public.pinned_trips
  ADD CONSTRAINT pinned_trips_position_check CHECK (position >= 0);

COMMENT ON TABLE public.pinned_trips IS
  'Per-user pinned trips (max 20). INSERT/UPDATE chỉ qua RPC pin_trip/unpin_trip/reorder_pinned_trips. RPC tự cleanup ghost row + enforce limit atomic.';

COMMENT ON COLUMN public.pinned_trips.position IS
  'Thứ tự trên hàng ghim ở home: 0 = đầu hàng (chuyến ghim gần nhất), liền mạch 0..n-1.';


-- ──────────────────────────────────────────────────────────────────────────────
-- pin_trip: cleanup ghost rows → idempotent → validate membership → check limit →
-- dời pin cũ ra sau → INSERT ở position 0
--
-- Errors:
--   42501 — not authenticated / forbidden (không phải member)
--   P0001 'max_pinned_reached' — đã ghim đủ 20 chuyến
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pinned_trips:' || v_uid::text, 0));

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
  IF (SELECT COUNT(*) FROM public.pinned_trips WHERE user_id = v_uid) >= 20 THEN
    RAISE EXCEPTION 'max_pinned_reached' USING ERRCODE = 'P0001';
  END IF;

  -- Dời pin cũ ra sau, đánh lại 1..n giữ thứ tự (lấp luôn lỗ hổng do ghost cleanup).
  UPDATE public.pinned_trips p
     SET position = r.new_pos
    FROM (
      SELECT id, row_number() OVER (ORDER BY position, pinned_at)::smallint AS new_pos
        FROM public.pinned_trips
       WHERE user_id = v_uid
    ) r
   WHERE p.id = r.id
     AND p.position IS DISTINCT FROM r.new_pos;

  INSERT INTO public.pinned_trips (user_id, trip_id, position)
       VALUES (v_uid, p_trip_id, 0)
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pin_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pin_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.pin_trip(uuid) IS
  'Atomic pin: cleanup ghost rows + idempotent check + validate membership + check limit 20 + ghim lên đầu hàng (position 0, pin cũ dời +1). Errors: 42501 (forbidden/no auth), P0001 max_pinned_reached.';


-- ──────────────────────────────────────────────────────────────────────────────
-- unpin_trip: DELETE + dồn các pin còn lại về 0..n-1 (giữ thứ tự).
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

  PERFORM pg_advisory_xact_lock(hashtextextended('pinned_trips:' || v_uid::text, 0));

  DELETE FROM public.pinned_trips
   WHERE user_id = v_uid AND trip_id = p_trip_id;

  UPDATE public.pinned_trips p
     SET position = r.new_pos
    FROM (
      SELECT id, (row_number() OVER (ORDER BY position, pinned_at) - 1)::smallint AS new_pos
        FROM public.pinned_trips
       WHERE user_id = v_uid
    ) r
   WHERE p.id = r.id
     AND p.position IS DISTINCT FROM r.new_pos;
END;
$$;

REVOKE ALL ON FUNCTION public.unpin_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unpin_trip(uuid) TO authenticated;

COMMENT ON FUNCTION public.unpin_trip(uuid) IS
  'Idempotent unpin: DELETE row + dồn các pin còn lại về 0..n-1. Không lỗi nếu trip chưa pin.';


-- ──────────────────────────────────────────────────────────────────────────────
-- reorder_pinned_trips: hoán vị các pin được liệt kê trong chính các slot chúng chiếm.
-- Input: >= 2 trip_id khác nhau theo thứ tự mong muốn. Truyền đủ mọi pin = sắp lại cả hàng;
-- truyền 2 pin đang ở slot 0/1 = đổi chỗ 2 card như client cũ.
-- Errors:
--   42501 — auth / có id không phải pin của user
--   22023 — input không đúng format (cần >= 2 ids khác nhau, không NULL)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_pinned_trips(p_trip_ids uuid[])
RETURNS SETOF public.pinned_trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.auth_user_id();
  v_n integer := coalesce(array_length(p_trip_ids, 1), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_n < 2 THEN
    RAISE EXCEPTION 'reorder requires at least 2 trip ids' USING ERRCODE = '22023';
  END IF;

  -- COUNT(DISTINCT) bỏ qua NULL → mảng có NULL hoặc id lặp đều bị chặn.
  IF (SELECT COUNT(DISTINCT x) FROM unnest(p_trip_ids) AS x) <> v_n THEN
    RAISE EXCEPTION 'reorder requires distinct trip ids' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pinned_trips:' || v_uid::text, 0));

  -- Mọi id phải là pin hiện hữu của user.
  IF (
    SELECT COUNT(*) FROM public.pinned_trips
     WHERE user_id = v_uid AND trip_id = ANY(p_trip_ids)
  ) <> v_n THEN
    RAISE EXCEPTION 'pin not found' USING ERRCODE = '42501';
  END IF;

  -- id thứ k trong mảng nhận slot nhỏ thứ k trong các slot mà nhóm id này đang chiếm.
  UPDATE public.pinned_trips p
     SET position = s.position
    FROM unnest(p_trip_ids) WITH ORDINALITY AS l(trip_id, ord)
    JOIN (
      SELECT position, row_number() OVER (ORDER BY position) AS ord
        FROM public.pinned_trips
       WHERE user_id = v_uid AND trip_id = ANY(p_trip_ids)
    ) s ON s.ord = l.ord
   WHERE p.user_id = v_uid
     AND p.trip_id = l.trip_id
     AND p.position IS DISTINCT FROM s.position;

  RETURN QUERY
    SELECT * FROM public.pinned_trips
     WHERE user_id = v_uid
     ORDER BY position;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_pinned_trips(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_pinned_trips(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_pinned_trips(uuid[]) IS
  'Hoán vị các pin được liệt kê (>= 2 trip_id khác nhau, theo thứ tự mới) trong chính các slot chúng chiếm; pin không liệt kê giữ nguyên. Atomic qua DEFERRED unique constraint. Errors: 42501 (auth/not-found), 22023 (cần >= 2 ids khác nhau).';
