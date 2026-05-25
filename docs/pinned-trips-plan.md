# Pinned Trips — Plan (Hybrid Sheet Architecture)

## Context

Trong 3-4 ngày của chuyến đi và vài ngày kế tiếp, user Fair Pay tập trung gần như tuyệt đối vào trip đó — vào app chỉ để xem **danh sách khoản chi** của chuyến. Hiện tại từ home cần 4 tap (group → tab Chuyến đi → trip → tab Chi phí). Mục tiêu: ghim tối đa 2 trip lên home, truy cập 1-tap.

## Design Decisions

| Decision | Choice | Lý do |
|---|---|---|
| Entry — TripsTab long-press | Sheet contextual nhỏ (Ghim/Bỏ ghim trip đó) | Đúng pattern long-press = action on item; 2-tap nhanh |
| Entry — Home section | Empty CTA + "Quản lý" → picker global | Discovery khi 0 pin; batch view trips toàn app |
| Picker interaction | Checkbox style, tap = immediate toggle | Đơn giản, không Save/Cancel staging |
| Picker dismiss | Swipe down / backdrop, KHÔNG nút "Đóng" | Gorhom default |
| DB limit enforcement | RPC `pin_trip` (cleanup ghost + check) | Tránh RLS COUNT block oan ghost row |
| Position persistence | Column `position smallint` + RPC `reorder_pinned_trips` | Drag-swap survive restart |
| Reorder UI | Drag-swap khi đủ 2 pin (DIY reanimated + RNGH) | Không cài lib mới (CLAUDE.md §npm install) |
| Notify/log | Không | Personal preference, giống `expense_presets` |

## Schema

### Migration 1: `supabase/migrations/20260519150000_add_pinned_trips.sql`

```sql
CREATE TABLE pinned_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position IN (0, 1)),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinned_trips_user_trip_unique UNIQUE (user_id, trip_id),
  CONSTRAINT pinned_trips_user_pos_unique UNIQUE (user_id, position) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE pinned_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own pins" ON pinned_trips FOR SELECT
  USING (user_id = auth_user_id());
CREATE POLICY "Users delete own pins" ON pinned_trips FOR DELETE
  USING (user_id = auth_user_id());

REVOKE INSERT, UPDATE ON pinned_trips FROM PUBLIC, authenticated;
```

`user_id uuid` (match `auth_user_id()` return type). DEFERRED unique cho `position` để swap atomic trong RPC.

### Migration 2: `supabase/migrations/20260519150100_pinned_trips_rpcs.sql`

3 RPC `SECURITY DEFINER + SET search_path = public, pg_temp`:

- **`pin_trip(p_trip_id uuid)`**: cleanup ghost (trip soft/hard deleted hoặc user rời group) → idempotent early-return nếu đã pin → validate membership → check limit (P0001 max_pinned_reached) → assign next free position (0 hoặc 1) → INSERT.
- **`unpin_trip(p_trip_id uuid)`**: DELETE + compact pin còn lại về pos 0.
- **`reorder_pinned_trips(p_trip_ids uuid[])`**: input array 2 trip_id theo thứ tự mới. Single UPDATE qua CTE, DEFERRED constraint kiểm ở commit.

Error map [src/utils/error.ts](../src/utils/error.ts) — context "ghim":
- `42501` → "Bạn không có quyền ghim chuyến đi này"
- `P0001 max_pinned_reached` → "Chỉ được ghim tối đa 2 chuyến đi"
- `23505` → "Chuyến đi này đã được ghim sẵn" (safety net)

## Service — append [src/services/trip.service.ts](../src/services/trip.service.ts)

```ts
export async function fetchPinnedTrips(): Promise<Trip[]>
// SELECT pinned_trips JOIN trips, filter deleted_at IS NULL, ORDER BY position ASC.

export async function pinTrip(tripId: string): Promise<void>
// rpc('pin_trip', { p_trip_id: tripId }). Idempotent.

export async function unpinTrip(tripId: string): Promise<void>
// rpc('unpin_trip', { p_trip_id: tripId }).

export async function reorderPinnedTrips(orderedTripIds: [string, string]): Promise<void>
// rpc('reorder_pinned_trips', { p_trip_ids: orderedTripIds }).

export async function fetchAllUserTrips(): Promise<TripWithGroup[]>
// JOIN trips + groups + group_members, filter trips.deleted_at IS NULL + gm.user_id = current + gm.left_at IS NULL.
// ORDER BY group_name, trips.created_at DESC.
```

`MAX_PINNED_TRIPS = 2` ở [src/config/constants.ts](../src/config/constants.ts).

## Store — extend [src/stores/trip.store.ts](../src/stores/trip.store.ts)

State thêm:
```ts
pinnedTrips: Trip[];                  // sorted by position
pinnedTripIds: Set<string>;           // O(1) check
isLoadingPinnedTrips: boolean;
allUserTrips: TripWithGroup[] | null; // lazy load khi picker mở
isLoadingAllTrips: boolean;
```

Actions:
- `loadPinnedTrips()` — fetch + immutable `new Set([...ids])`. Silent fail.
- `loadAllUserTrips()` — fetch khi picker mở, không cache (luôn fresh).
- `togglePin(tripId)` — check `pinnedTripIds.has` → pinTrip/unpinTrip. Immutable Set update + rollback nếu fail. Refetch pinned sau success.
- `reorderPinnedTripsLocal([a, b])` — optimistic swap + RPC, revert nếu fail.
- Extend `reset()` ([trip.store.ts:293](../src/stores/trip.store.ts#L293)) clear cả 5 field.

## UI Components

### 1. `src/components/trip/TripActionSheet.tsx` — Contextual sheet (mới)

Props: `{ trip: Trip | null, isOpen, onOpenChange }`.

- 1 action: "📌 Ghim chuyến này" / "📌 Bỏ ghim" tùy `pinnedTripIds.has(trip.id)`.
- Khi `pinnedTrips.length >= 2 && !isPinned`: disabled + caption "Đã ghim 2 chuyến — bỏ ghim trước".
- Loading state local + disable button mid-RPC → chống double-tap.
- Auto-close sheet sau success.
- Reference: `QuickAddActionSheet` (action chips, no input).

### 2. `src/components/home/PinPickerSheet.tsx` — Global picker (mới)

Props: `{ isOpen, onOpenChange }`.

Layout:
- Header: "Ghim chuyến đi" + caption "Đã ghim {n}/2".
- Body: `BottomSheetSectionList` (gorhom v5), sections theo `group_name`.
- Mỗi row:
  - Left: icon MapPin + trip name + status chip.
  - Right: checkbox state-driven:
    - `pinned` → checked (filled primary).
    - `unpinned && pinnedCount < 2` → unchecked outline.
    - `unpinned && pinnedCount >= 2` → grey disabled.
  - Tap row hoặc checkbox → `togglePin(tripId)` immediate.
  - Tap disabled → toast info "Đã ghim tối đa 2 chuyến đi".
- Per-row spinner overlay khi RPC chạy (local `pendingIds: Set<string>`).
- Empty: nếu `allUserTrips.length === 0` → caption "Bạn chưa có chuyến đi nào".

Sheet:
- Snap points `['70%', '90%']`, `enableDynamicSizing={false}`.
- KHÔNG nút Đóng — swipe down / backdrop dismiss.
- `onChange` open → `loadAllUserTrips()`.

### 3. `src/components/home/PinnedTripCard.tsx` — (mới, React.memo)

Compact card wrap trong `Animated.View`:
- Icon Pin filled + tên trip (semibold) + tên group (caption muted) + chip status.
- KHÔNG tổng chi tiêu v1.
- `onPress` → `router.push('/(main)/trips/{id}')` (tab Chi phí default sẵn).

### 4. `src/components/home/PinnedTripsSection.tsx` — (mới)

**Luôn render**. 3 layout state:

| `pinnedTrips.length` | Layout |
|---|---|
| 0 | Empty card full-width: icon Pin outline + "Ghim chuyến đi để truy cập nhanh" + button "+ Ghim ngay" → mở picker |
| 1 | 1 card full-width |
| 2 | Flex row split 50/50 gap 12, **bọc trong Gesture.Simultaneous(LongPress, Pan) cho drag-swap** |

Header (≥1 pin):
- Title "GHIM NHANH" (caption uppercase muted)
- Right: link "Quản lý" → mở picker

## Drag-to-swap (chỉ khi `length === 2`)

DIY với `react-native-reanimated` (4.2.1) + `react-native-gesture-handler` (2.30) — không cài lib mới.

```ts
const translateX = useSharedValue(0);
const isLifted = useSharedValue(0);

const longPress = Gesture.LongPress().minDuration(400)
  .onStart(() => { 'worklet'; isLifted.value = withSpring(1); runOnJS(hapticMedium)(); })
  .onEnd((_, success) => {
    'worklet';
    // Long-press không pan → fallback open TripActionSheet cho card đó
    if (success && Math.abs(translateX.value) < 4) runOnJS(openSheetForCard)();
  });

const pan = Gesture.Pan().activeOffsetX([-10, 10])
  .onUpdate(e => { 'worklet'; if (isLifted.value > 0) translateX.value = e.translationX; })
  .onEnd(e => {
    'worklet';
    const shouldSwap = Math.abs(e.translationX) > cardWidth / 2;
    if (shouldSwap) { runOnJS(hapticLight)(); runOnJS(commitSwap)(); }
    translateX.value = withSpring(0);
    isLifted.value = withSpring(0);
  });
```

Card được drag: scale 1.03 + shadow elevation. Card đối diện: mirror translate (-translateX).

Performance: worklet 60fps native thread, no JS bridge mid-gesture.

## Wire-up

### [src/components/group/TripsTab.tsx](../src/components/group/TripsTab.tsx)

- Thêm prop `onTripLongPress?: (trip: Trip) => void` vào `TripsTabProps`.
- Pass `onLongPress={() => onTripLongPress?.(item)}` vào `<AppCard>` [line 33](../src/components/group/TripsTab.tsx#L33).
- **Pin badge**: subtitle = `${pinnedTripIds.has(item.id) ? '📌 ' : ''}${status}`. Read store via selector.

### Parent — [src/app/(main)/groups/[id].tsx:379](../src/app/(main)/groups/[id].tsx#L379)

State `selectedTripForAction: Trip | null`. Pass `onTripLongPress={setSelectedTripForAction}` vào `<TripsTab>`. Render `<TripActionSheet trip={selectedTripForAction} isOpen={!!selectedTripForAction} onOpenChange={(o) => !o && setSelectedTripForAction(null)} />`.

### Home — [src/app/(main)/(tabs)/index.tsx](../src/app/(main)/(tabs)/index.tsx)

- Sau `<PendingRibbon>` (~line 195), trước SectionHeader "NHÓM CỦA BẠN" (~line 198): render `<PinnedTripsSection onManagePress={() => setPickerOpen(true)} />`.
- State `pickerOpen: boolean`. Render `<PinPickerSheet isOpen={pickerOpen} onOpenChange={setPickerOpen} />` cuối file.
- `useFocusEffect`: gọi `loadPinnedTrips()`.

### Haptics
Reuse `hapticMedium`, `hapticLight` ([haptics.ts](../src/utils/haptics.ts)).

## Edge cases

| Case | Hành vi |
|---|---|
| Trip hard-delete khi đang pinned | DB CASCADE xóa row. Home focus refresh → biến mất. |
| Trip soft-delete | `fetchPinnedTrips` filter ẩn. Next `pin_trip` cleanup ghost. |
| Trip closed | Vẫn hiển thị, chip "Đã đóng". Không auto-unpin. |
| User rời group có trip pinned | JOIN ẩn ở UI. Next pin attempt cleanup. KHÔNG block oan (vì dùng RPC thay RLS COUNT). |
| User logout | `reset()` clear local. DB giữ nguyên. |
| Race 2 device pin | Serial trong RPC tx. Worst-case 3 pin trong vài ms, RPC sau raise P0001. |
| Vượt limit | RPC throw P0001 → toast danger. Sheet disable button. |
| Double-tap "Ghim" | UI disable mid-RPC + RPC idempotent (early-return nếu đã pin). |
| Drag offline | Optimistic swap → RPC fail → revert + toast danger. |
| Sync devices | Eventual qua `useFocusEffect` ở home. |

## Files cần modify / tạo

| File | Action |
|---|---|
| `supabase/migrations/20260519150000_add_pinned_trips.sql` | **NEW** |
| `supabase/migrations/20260519150100_pinned_trips_rpcs.sql` | **NEW** |
| `src/types/database.types.ts` | + `PinnedTripRow`, `TripWithGroup` |
| `src/config/constants.ts` | + `MAX_PINNED_TRIPS = 2` |
| `src/utils/error.ts` | + 3 error mappings |
| `src/services/trip.service.ts` | + 5 functions |
| `src/stores/trip.store.ts` | + 5 state + 4 actions + reset() |
| `src/components/trip/TripActionSheet.tsx` | **NEW** |
| `src/components/home/PinnedTripCard.tsx` | **NEW** |
| `src/components/home/PinnedTripsSection.tsx` | **NEW** |
| `src/components/home/PinPickerSheet.tsx` | **NEW** |
| `src/components/group/TripsTab.tsx` | Prop + onLongPress + 📌 badge |
| `src/app/(main)/groups/[id].tsx` | State + render TripActionSheet |
| `src/app/(main)/(tabs)/index.tsx` | Render section + picker + useFocusEffect |

## Sequencing

1. Write 2 migration SQL files.
2. Apply qua `mcp__supabase__apply_migration` vào project `cyrbqnvdojozidmtjpsl` (fair-pay).
3. Smoke test 3 RPC qua `mcp__supabase__execute_sql`.
4. Types + constants + error map (parallel).
5. Service: 5 functions.
6. Store: state + actions + reset.
7. `TripActionSheet`.
8. Wire `TripsTab` (prop + 📌) + parent `groups/[id].tsx`.
9. `PinnedTripCard`.
10. `PinnedTripsSection` 3-state (chưa drag).
11. `PinPickerSheet`.
12. Wire home (section + picker + useFocusEffect).
13. Drag-to-swap gesture.
14. `npx tsc --noEmit && npx jest`.
15. Manual QA matrix.

## Verification — Manual QA (19 case)

### Contextual flow (TripsTab)
- [ ] Long-press trip row → sheet hiện đúng tên trip.
- [ ] Tap "Ghim" → toast success → home thấy card.
- [ ] Trip vừa pin hiện 📌 badge trong subtitle.
- [ ] Long-press trip đã pin → button "Bỏ ghim" → home update biến mất.
- [ ] Long-press trip thứ 3 khi đủ 2 pin → button disabled + caption max.
- [ ] Double-tap "Ghim" → 1 row, không lỗi.

### Picker flow (Home)
- [ ] Home 0 pin → section show empty card + "+ Ghim ngay".
- [ ] Tap "+ Ghim ngay" → picker mở.
- [ ] Picker list all trips grouped theo nhóm.
- [ ] Tap row chưa pin → tick + card xuất hiện home.
- [ ] Tap row đã pin → untick + card biến mất.
- [ ] Pin 2 trips → row thứ 3 grey disabled.
- [ ] Tap row disabled → toast max.
- [ ] Swipe down picker → dismiss.

### Layout
- [ ] 1 pin: card full width.
- [ ] 2 pin: 2 card split 50/50 gap 12.

### Drag swap (2 pin)
- [ ] Long-press card → lift + haptic.
- [ ] Pan qua midpoint → swap + DB position update.
- [ ] Pan dưới threshold → spring back.
- [ ] Long-press không pan → fallback mở sheet.
- [ ] Restart app sau swap → thứ tự giữ.

### Edge cases
- [ ] Hard-delete trip pinned → tự biến mất.
- [ ] Soft-delete trip pinned → ẩn UI; pin mới không block oan.
- [ ] User rời group → trip ẩn khỏi section + picker.
- [ ] Logout A → login B → không leak.
- [ ] Drag offline → revert + toast.

### Code quality
- [ ] `npx tsc --noEmit` pass.
- [ ] `npx jest` pass.
