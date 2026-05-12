-- Preset full-template: cho phép preset gắn trip + lưu paid_by/splits optional.
-- Plan: noble-orbiting-bumblebee.md
--
-- 2 scope preset:
--   - Global: trip_id NULL, paid_by_member_id NULL, splits NULL. Template tái dùng.
--   - Trip-pinned: trip_id required. paid_by/splits optional (partial vs full).
--
-- splits_data lưu RULE (member list + ratio/amount), không lưu final amounts.
-- Khi xóa trip → CASCADE xóa preset trip-pinned tương ứng.
-- Khi member rời nhóm → paid_by_member_id thành NULL (SET NULL); apply-time fallback default.

-- 1. Add scope + full-template columns
ALTER TABLE expense_presets
  ADD COLUMN trip_id uuid NULL REFERENCES trips(id) ON DELETE CASCADE,
  ADD COLUMN paid_by_member_id uuid NULL REFERENCES group_members(id) ON DELETE SET NULL,
  ADD COLUMN split_type text NULL,
  ADD COLUMN splits_data jsonb NULL;

-- 2. split_type CHECK
ALTER TABLE expense_presets
  ADD CONSTRAINT expense_presets_split_type_check
    CHECK (split_type IS NULL OR split_type IN ('equal', 'ratio', 'custom'));

-- 3. Consistency: nếu paid_by/splits set thì phải có trip_id
ALTER TABLE expense_presets
  ADD CONSTRAINT preset_scope_consistency CHECK (
    -- Global: tất cả NULL
    (trip_id IS NULL AND paid_by_member_id IS NULL AND split_type IS NULL AND splits_data IS NULL)
    -- Trip-pinned: trip_id required; paid_by/splits optional (cả 2 hoặc đều null)
    OR (trip_id IS NOT NULL)
  );

-- 4. split_type và splits_data phải đi cùng (cả 2 NULL hoặc cả 2 NOT NULL)
ALTER TABLE expense_presets
  ADD CONSTRAINT preset_splits_pair CHECK (
    (split_type IS NULL AND splits_data IS NULL)
    OR (split_type IS NOT NULL AND splits_data IS NOT NULL)
  );

-- 5. Drop old unique index (chỉ user_id + title — không cho phép trùng title giữa global và trip-pinned)
DROP INDEX IF EXISTS idx_presets_user_title;

-- 6. Partial unique indexes cho 2 scope
CREATE UNIQUE INDEX idx_presets_unique_global
  ON expense_presets (user_id, title)
  WHERE trip_id IS NULL;

CREATE UNIQUE INDEX idx_presets_unique_trip_scope
  ON expense_presets (user_id, title, trip_id)
  WHERE trip_id IS NOT NULL;

-- 7. Index để query nhanh "preset của trip X"
CREATE INDEX idx_presets_trip ON expense_presets (trip_id) WHERE trip_id IS NOT NULL;

-- 8. Update RLS INSERT policy: validate user là member của group chứa trip + paid_by member khớp trip
DROP POLICY IF EXISTS "Users create own presets" ON expense_presets;
CREATE POLICY "Users create own presets" ON expense_presets FOR INSERT
  WITH CHECK (
    user_id = auth_user_id()
    AND (
      -- Global: không validate trip
      trip_id IS NULL
      OR EXISTS (
        SELECT 1 FROM trips t
        JOIN group_members gm ON gm.group_id = t.group_id
        WHERE t.id = trip_id
          AND gm.user_id = auth_user_id()
          AND gm.left_at IS NULL
      )
    )
    AND (
      paid_by_member_id IS NULL
      OR EXISTS (
        SELECT 1 FROM group_members gm
        JOIN trips t ON t.group_id = gm.group_id
        WHERE gm.id = paid_by_member_id
          AND t.id = expense_presets.trip_id
      )
    )
  );

-- 9. Thêm UPDATE policy (trước đây thiếu — updatePreset bị bug silent)
DROP POLICY IF EXISTS "Users update own presets" ON expense_presets;
CREATE POLICY "Users update own presets" ON expense_presets FOR UPDATE
  USING (user_id = auth_user_id())
  WITH CHECK (
    user_id = auth_user_id()
    AND (
      trip_id IS NULL
      OR EXISTS (
        SELECT 1 FROM trips t
        JOIN group_members gm ON gm.group_id = t.group_id
        WHERE t.id = trip_id
          AND gm.user_id = auth_user_id()
          AND gm.left_at IS NULL
      )
    )
    AND (
      paid_by_member_id IS NULL
      OR EXISTS (
        SELECT 1 FROM group_members gm
        JOIN trips t ON t.group_id = gm.group_id
        WHERE gm.id = paid_by_member_id
          AND t.id = expense_presets.trip_id
      )
    )
  );

COMMENT ON COLUMN expense_presets.trip_id IS 'NULL = global preset (cross-group template). NOT NULL = pinned vào trip cụ thể, CASCADE delete.';
COMMENT ON COLUMN expense_presets.paid_by_member_id IS 'Optional, chỉ set khi trip_id set. Khi member rời nhóm → SET NULL; apply-time fallback current user.';
COMMENT ON COLUMN expense_presets.splits_data IS 'jsonb array of {member_id, ratio?, amount?}. Format theo split_type: equal=[{member_id}], ratio=[{member_id,ratio}], custom=[{member_id,amount}].';
