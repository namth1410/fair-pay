# Code Review — Fair Pay (branch `main`)

**Phạm vi:** Review toàn bộ thay đổi chưa commit trên branch `main` (≈1.214 dòng thêm / 682 dòng xoá, trải đều ở 44 file đã sửa + 32 file mới).

**Trạng thái build:**
- `npx jest` — **PASS** (10 suites, 167 tests).
- `npx tsc --noEmit` — **PASS** (exit 0).

**Severity:** `[blocking]` phải fix trước khi merge · `[important]` nên fix · `[nit]` cosmetic · `[suggestion]` đề xuất · `[praise]` làm tốt.

---

## 1. Tổng quan

Branch giới thiệu một loạt feature lớn:
- **Hệ thống notification** đầy đủ (service + store + UI + 11 type + dedup window 10 phút).
- **GlassCapsuleHeader** mới với physics simulation (Skia + Reanimated + sensor).
- **FancyToast** wrapper thay thế `useToast` HeroUI raw, kèm 12 Skia effect.
- **GroupCarousel** trên home với toggle list/carousel.
- **BlackHoleTransition / LightningTransition / SplashScene** — animation context.
- **Preset khoản chi** đã có route quản lý riêng.
- **MoneyTextField** + `userPreferences` (haptics/animations/homeViewMode) + nhiều util thuần (`capsuleMath`, `explainBalance`, `notificationFormat`, `lightning`).

Chất lượng kiến trúc tổng thể tốt: phân lớp rõ (math thuần → physics hook → render), test coverage cho utils mới đầy đủ, tôn trọng `animations_enabled` lan đến mọi Skia primitive, fancyToast wrapper được callsite tuân thủ đúng (không phát hiện vi phạm). Tuy nhiên có **một số lỗ hổng quan trọng cần xử lý trước khi ship**, đặc biệt là gap về audit log (`trip.close`/`reopen`), schema SQLite chưa migrate, dev-panel còn trên home production và một số race/cleanup trong physics + animation context.

### Bảng điểm theo module

| Module | Điểm | Ghi chú |
|---|---|---|
| `services/notification.service.ts` (mới, 611 dòng) | 8/10 | Architecture đẹp, dedup hợp lý, `formatNotificationTitle` pure. Cần thêm filter `trip_id` cho dedup, recipient guard khi RLS chặn. |
| `services/group.service.ts` (sửa) | 8/10 | Đúng pattern `assertRole` + audit. Có vài N+1 query có thể gom. |
| `services/user.service.ts` (sửa) | 6/10 | Thiếu migration legacy `notify_expense/notify_reminder` → user cũ revert default. |
| `stores/trip.store.ts` (sửa) | 6/10 | `toggleTripStatus` thiếu `logAction` cho close/reopen (vi phạm rule). |
| `stores/notification.store.ts` (mới) | 7/10 | `markAsRead` race khi tính `unreadCount`. Cursor `created_at` có thể duplicate. |
| `stores/auth.store.ts` (sửa) | 7/10 | `signOut` không reset `notification.store` → flash data user cũ ở user mới. |
| `utils/capsuleMath.ts` (mới) | 9/10 | Pure, có `'worklet'`, test đầy đủ. Thiếu guard `innerR <= 0`. |
| `utils/userPreferences.ts` (mới) | 7/10 | Top-level `useAuthStore.subscribe` chạy ở module load — khó test, không cleanup. |
| `utils/notificationFormat.ts` (mới) | 8/10 | Pure, test đầy đủ. Edge case `amount=undefined` với payment chưa cover. |
| `utils/format.ts` (sửa) | 8/10 | `formatThousands` mất dấu âm, `parseInt` precision. |
| `app/(main)/index.tsx` (sửa) | 5/10 | `ToastTestPanel` chưa wrap `__DEV__`; `ScrollView` thay `FlatList` mất virtualization; `SuckTarget` snapshot toàn bộ list. |
| `app/(main)/notifications.tsx` (mới) | 7/10 | List perf tốt, nhưng empty state không phân biệt filter, deeplink chưa map theo type, swipe-delete không undo/confirm. |
| `app/(main)/settings.tsx` (sửa) | 7/10 | `newName` không sync khi profile đến sau mount; route animation đổi sang `fade` đi ngược CLAUDE.md. |
| `components/header/*` (mới) | 6/10 | Architecture sạch, nhưng `frameCallback` cleanup có điều kiện sai, `slots.titleBall` reset state mỗi render, `frameCallback.isActive` không tồn tại. |
| `components/ui/fancyToast/*` (mới) | 8/10 | Wrapper đúng spec, ring buffer per-variant gọn. Vài Skia background re-mount do palette không memo. |
| `components/notifications/*` (mới) | 8/10 | Avatar+icon overlay UX tốt, virtualization tuned. Swipe-delete thiếu safety net. |
| `contexts/BlackHoleTransition.tsx` (mới) | 6/10 | `setTimeout(onCovered, 1300)` không cleanup khi unmount → callback firing trên route đã unmount. |

---

## 2. Vấn đề cần xử lý trước merge — `[blocking]`

### 2.1. ✋ `ToastTestPanel` còn render trên home production
[src/app/(main)/index.tsx:18,136](src/app/(main)/index.tsx#L18)

```tsx
import { ToastTestPanel } from '../../components/home/ToastTestPanel';
...
<ToastTestPanel />
```

Đây là dev panel test 12 effect Skia. Ship lên user → mọi user thấy panel debug ngay đầu home. **Fix:** `{__DEV__ && <ToastTestPanel />}` hoặc xoá hẳn.

### 2.2. ✋ Schema SQLite vẫn dùng key cũ `notify_expense/notify_reminder`
[src/db/schema.ts:11](src/db/schema.ts#L11)

```sql
settings TEXT DEFAULT '{"dark_mode":"system","notify_expense":true,"notify_reminder":true}'
```

CLAUDE.md đã ghi rõ "KHÔNG còn legacy `notify_expense`/`notify_reminder`". UI mới dùng `notify_activity / notify_payment / notify_member / notify_smart / haptics_enabled / animations_enabled`. User tạo profile lần đầu (offline path) sẽ có settings sai shape. **Fix:** đồng bộ default JSON + thêm migration trong [src/db/migrations.ts](src/db/migrations.ts) để rename key cho user cũ.

### 2.3. ✋ Migration runtime cho settings cũ trên Postgres
[src/services/user.service.ts:70](src/services/user.service.ts#L70) (vùng `fetchCurrentUser`)

User đã từng tắt `notify_expense=false` trên DB sẽ bị merge thành `{ notify_expense:false, notify_activity:true (default) }`. → **Default `true` xâm phạm consent**: user đã từng opt-out có thể bị bật lại notification. **Fix:** trong `fetchCurrentUser`:

```ts
const raw = data?.settings ?? {};
const migrated: Partial<UserSettings> = { ...raw };
if ('notify_expense' in raw) migrated.notify_activity = (raw as Record<string, unknown>).notify_expense as boolean;
if ('notify_reminder' in raw) migrated.notify_smart = (raw as Record<string, unknown>).notify_reminder as boolean;
delete (migrated as Record<string, unknown>).notify_expense;
delete (migrated as Record<string, unknown>).notify_reminder;
return { ...DEFAULT_SETTINGS, ...migrated };
```

Đồng thời chạy 1 lần migration trên DB Supabase (script update `users.settings`) để không phải migrate runtime mãi.

### 2.4. ✋ `toggleTripStatus` thiếu `logAction` cho `trip.close` / `trip.reopen`
[src/stores/trip.store.ts:110-127](src/stores/trip.store.ts#L110-L127)

Có gọi `notifyTripClosed` cho close, không có cho reopen, **và không có audit cho cả hai**. Vi phạm CLAUDE.md "Mọi service mutation tạo/sửa/xóa dữ liệu nhóm PHẢI gọi `notifyXxxEvent()` … song song với `logAction()`". Hệ quả: audit trail không có hành động đóng/mở chuyến — không trace được khi cần. **Fix:** thêm `logAction({ action: 'trip.close' / 'trip.reopen', ... })` trong cả 2 nhánh, dùng `Promise.allSettled` để không block main flow.

### 2.5. ✋ `useAuthStore.subscribe` top-level trong `userPreferences.ts`
[src/utils/userPreferences.ts:96-104](src/utils/userPreferences.ts#L96-L104)

Subscribe chạy ngay khi module được import → side effect ở module load:
- Khó test (mock thứ tự sai → subscribe vào instance mock cũ).
- Không bao giờ unsubscribe → không clean (acceptable cho singleton, nhưng pattern tệ).
- Nếu module được tree-shake hoặc lazy-load khác nhau giữa env, behavior thay đổi.

**Fix:** gói trong hàm `bindAuthStoreSync()` và gọi 1 lần ở [src/app/_layout.tsx](src/app/_layout.tsx) cùng `bootstrapPreferences()`.

### 2.6. ✋ Hooks order vi phạm trong `GlassCapsuleHeader`
[src/components/header/GlassCapsuleHeader.tsx:65-69](src/components/header/GlassCapsuleHeader.tsx#L65-L69)

```tsx
if (!usePhysics) return <NativeFallbackHeader ... />;
```

Đặt SAU `useState`/`useEffect`, TRƯỚC nhánh hooks của `PhysicsHeader`. Khi `usePhysics` toggle giữa true/false (Reduce Motion bật runtime, hoặc user đổi `animations_enabled`), `PhysicsHeader` mount/unmount → shared values bị tạo lại từ đầu → header flash. Đồng thời React DevTools sẽ warn về Hook order khi toggle. **Fix:** render cả 2 nhánh trong cùng tree (dùng prop `enabled` truyền vào `useCapsulePhysics`), hoặc tách làm 2 component riêng cấp cha.

### 2.7. ✋ `useCapsulePhysics` cleanup chỉ chạy nếu đã rest
[src/components/header/useCapsulePhysics.ts:340-346](src/components/header/useCapsulePhysics.ts#L340-L346)

`useEffect` cleanup chỉ tắt `frameCallback` khi `restingCounter.value >= RESTING_FRAMES`. Khi component unmount giữa lúc đang chuyển động → frame loop chạy mãi → memory + battery leak. **Fix:** vô điều kiện `frameCallback.setActive(false)` trong cleanup. Cũng đúng cho subscriber sensor.

### 2.8. ✋ `BlackHoleTransition`: `setTimeout(onCovered, 1300)` không cleanup
[src/contexts/BlackHoleTransition.tsx:614-616](src/contexts/BlackHoleTransition.tsx#L614-L616)

Nếu user back hoặc app close lúc 700ms, callback vẫn fire → push route đã unmount → có thể crash hoặc state inconsistent. **Fix:** lưu timeoutId trong ref và clear trong cleanup `useEffect` hoặc khi `clear()` được gọi sớm.

### 2.9. ✋ `frameCallback.isActive` không phải public API của Reanimated 3
[src/components/header/useCapsulePhysics.ts:323-325](src/components/header/useCapsulePhysics.ts#L323-L325)

`useFrameCallback` chỉ expose method `setActive(boolean)`, không có property `isActive`. Đọc `frameCallback.isActive` trả `undefined` → `!undefined = true` → mỗi tick sensor gọi `setActive(true)` (no-op nhưng tốn JS bridge). **Fix:** lưu state "active" qua `useRef<boolean>`.

---

## 3. Vấn đề quan trọng — `[important]`

### Notification system

- **`notification.service.ts:131-148`** — Dedup query `(user, group, type, actor)` thiếu filter `trip_id`. 2 trip cùng group/actor cùng type sẽ gộp chung trong 10 phút → user thấy "1 đã thêm 2 khoản chi" mà thực ra ở 2 trip khác → click không biết trip nào, `target_ids` trộn lẫn. **Fix:** thêm `eq('trip_id', tripId)` (hoặc `is('trip_id', null)`) khi caller có `tripId`.
- **`notification.service.ts:66-95`** — `getGroupRecipients` join `users:user_id(id, settings)`. Nếu RLS chặn join, `userRel = null` → `enabled = settings?.[settingKey] ?? true` mặc định true → leak notification cho user đã tắt setting. **Fix:** `if (userRel === null) skip` thay vì default true.
- **`notification.service.ts:316-317`** + `trip.store.ts` — Type `expense.edited` được khai báo nhưng chưa fire ở store nào. Hoặc thiếu hành động `editExpense`, hoặc đã gọi nơi khác mà không notify. Cần audit luồng edit.
- **`notification.service.ts:206-210`** — Race giữa `existing` query và `insert`: 2 mutation song song có thể cùng đọc `existing=[]` → 2 row cùng `(user, group, type, actor)`. **Fix:** UPSERT với unique partial index `(user_id, group_id, type, actor_id) WHERE read_at IS NULL`.
- **`stores/notification.store.ts:90-98`** — `markAsRead` set state đọc `get().items` 2 lần → counted lệch khi items đổi giữa 2 lần. **Fix:** snapshot `before = get().items` rồi tính.
- **`stores/notification.store.ts:62-71`** — `loadMore` cursor `created_at` có thể duplicate khi 2 row cùng millisecond (hay xảy ra do dedup `created_at = now()`). **Fix:** tie-break compound `(created_at, id)` hoặc dùng `range(offset, limit)`.
- **`stores/auth.store.ts:170-172`** — `signOut` không reset `notification.store`. User mới login (cùng device) flash notification của user cũ. **Fix:** `useNotificationStore.getState().reset()` trong signOut.
- **`stores/trip.store.ts:113-114, 141, 170, 204`** — `profile` từ store có thể null (race với fetch profile). Notify bị skip im lặng → dev khó debug. **Fix:** `if (__DEV__ && !profile) console.warn('[trip] notify skipped')`, hoặc fallback `getAuthUserId()` + fetch display_name.
- **`stores/trip.store.ts:230-244`** — `removePayment` có audit nhưng không có notify (`payment.deleted` chưa được khai báo trong `NotificationType`). Quyết định: thêm type hoặc skip với comment.
- **`stores/trip.store.ts:142-161, 205-225`** — `Promise.all([logAction, notifyXxx])`: nếu `logAction` throw (lỗi network), notify reject theo → user thấy error UI dù expense tạo thành công. **Fix:** dùng `Promise.allSettled`.

### Notification UI

- **`app/(main)/notifications.tsx:311-324`** — Empty state không phân biệt filter. Khi user filter `unread` hoặc theo nhóm cụ thể, rỗng nghĩa "không match filter" chứ không phải "chưa có notif". **Fix:** if `filter.scope === 'unread'` hoặc có group filter → đổi text + nút "Xoá bộ lọc".
- **`app/(main)/notifications.tsx:174-188`** — `handlePressById` deeplink chỉ tới `tripId`/`groupId`, miss:
  - `payment.recorded/received` → cần đến settlement tab.
  - `member.join_requested` → admin cần đến tab duyệt yêu cầu.
  - `expense.created/edited` → có `data.target_id` nhưng không scroll/highlight.
  **Fix:** map theo `notification.type` với `params: { tab: 'settlement'/'requests', highlight: target_id }`.
- **`app/(main)/notifications.tsx:312`** — Skeleton chỉ hiện khi `isRefreshing`, miss case lần đầu vào màn nếu store chưa có cờ `initialLoaded`. **Fix:** đổi sang `(isRefreshing || isLoading) && items.length === 0`.
- **`app/(main)/notifications.tsx:101-105`** — `fetchMyGroups().then(setGroups)` không cleanup khi unmount → React warning trên Android cold start. **Fix:** pattern `let cancelled = false;`.
- **`app/(main)/notifications.tsx:339`** — `loadMore` race với `isRefreshing`: scroll cuối ngay sau pull-to-refresh có thể inject duplicate ids. **Fix:** trong store `loadMore` thêm `if (isRefreshing) return`.
- **`app/(main)/notifications.tsx:114-118`** — `markAllAsRead` không confirm + toast success trước khi server xác nhận. **Fix:** `BouncyDialog` confirm khi >5 unread, check kết quả thật.
- **`components/notifications/NotificationRow.tsx:109-113`** — Swipe → tap "Xoá" → DELETE ngay, không undo, không confirm. **Fix:** undo toast 5s với restore state, hoặc `BouncyDialog` confirm.
- **`components/notifications/NotificationRow.tsx:115-117`** — Tap nhanh 2 lần → `markAsRead([id])` 2 round-trip Supabase. **Fix:** debounce hoặc local ref flag.

### Capsule header

- **`useCapsulePhysics.ts:130-141`** — `useEffect` reset `balls[i].value` mỗi lần `ballSpecs` đổi reference; `ballSpecs` deps gồm `slots.rightBalls` mà mảng được tạo MỚI mỗi render `useHeaderSlots`. → balls liên tục reset mất velocity → giật. **Fix:** memoize stable theo id, hoặc compare bằng id thay vì reference.
- **`useCapsulePhysics.ts:168-295`** — Frame callback chạy 60Hz cả khi `restingCounter >= RESTING_FRAMES` — counter chỉ tăng, không có nhánh tự `setActive(false)`. **Fix:** `if (restingCounter.value >= RESTING_FRAMES) { runOnJS(stopLoop)(); return; }`.
- **`headerSlots.tsx:172-184`** — `useMemo` deps gồm `lightning`, `navigation`, `setCreateJoinOpen` — reference mới mỗi render. → `RouteSlots` rebuild → trigger reset physics state. **Fix:** lift handlers ra `useCallback` ngoài memo.
- **`headerSlots.tsx:44-47`** — `estimateTitleWidth = 9px/char` sai cho semibold + dấu tiếng Việt → pill chật → text bị ellipsis dù còn chỗ. **Fix:** `onLayout` đo thật rồi update qua sharedValue.
- **`GlassCapsuleHeader.tsx:151-160`** — Cùng vấn đề `pillSpec` deps: object mới mỗi render → effect reset `pill.value` → pill nhảy.

### FancyToast

- **`fancyToast/effects.tsx`** — `MeshEmeraldToast/MeshRoseToast/MeshAmberToast/MeshSoftToast` build palette array literal mỗi render, truyền vào `MeshBackground` → `SkiaMeshGradient` shallow compare fail → re-render vô ích mỗi lần parent render. **Fix:** `useMemo(() => palette, [...primitive deps])`.
- **`fancyToast/effects.tsx`** — `MeshBackground/HaloBackground/ShimmerOverlay` dùng `onLayout` → render 2 frame: frame 1 size=0 (return null), frame 2 mới mount Skia → toast entrance đã chạy → Skia "pop in" → flash. **Fix:** render placeholder cùng baseColor để đỡ.
- **`fancyToast/effects.tsx`** — `wrapEntering(enter)` cast `as never` → bỏ qua type check. **Fix:** wrapper type rõ ràng hoặc dùng `@ts-expect-error` để TS phát hiện khi shape HeroUI đổi.

### Screen-level

- **`app/(main)/_layout.tsx`** — `settings` đổi animation sang `fade` đi ngược CLAUDE.md (`slide_from_right`). Nếu intentional, cập nhật doc; nếu không, đổi lại.
- **`app/(main)/_layout.tsx`** — `groups/[id]` đổi sang `animation: 'fade'` overlap với Skia overlay của BlackHole transition → flash trên Android low-end. **Fix:** `animation: 'none'` cho route được transition tự lo.
- **`app/(main)/index.tsx`** — Destructure `useGroupStore()` kéo cả 4 field → re-render khi 1 trong 4 đổi. **Fix:** tách selectors riêng (`useGroupStore(s => s.groups)`).
- **`app/(main)/index.tsx`** — `ScrollView` thay `FlatList` cho danh sách nhóm. User nhiều nhóm (>30) mất virtualization. Cần FlatList + `removeClippedSubviews`.
- **`app/(main)/index.tsx`** — `SuckTarget` wrap mọi `GroupRow` đăng ký N target. Khi `BlackHoleTransition.suck()` chạy, `Promise.all` measure + `makeImageFromView` cho TẤT CẢ rows → 20 rows = 20 snapshot song song → có thể ANR Android low-end. **Fix:** chỉ wrap row đang được tap, hoặc lazy register theo viewport.
- **`app/(main)/settings.tsx`** — `setNewName(profile?.display_name ?? '')` chỉ chạy 1 lần lúc mount. Nếu profile load chậm, `newName = ''` không cập nhật. **Fix:** `useEffect(() => { if (profile) setNewName(profile.display_name) }, [profile?.display_name])`.
- **`components/common/SplashScene.tsx`** — `Dimensions.get('window')` lúc module import, không update khi rotate/split-screen. **Fix:** `useWindowDimensions()`.
- **`components/home/GroupCarousel.tsx`** — `pan.failOffsetY([-20, 20])` có thể tranh chấp với pull-to-refresh ở `ScrollView` parent. Test kỹ trên iOS.
- **`components/home/GroupCarousel.tsx`** — `topIndex.value` unbounded grows (modular wrap). Sau hàng nghìn swipe có thể precision loss. **Fix:** reset `topIndex.value = topIndex % total` định kỳ.

### Utils

- **`utils/capsuleMath.ts:33-78`** — `clampCircleToCapsule` không guard `innerR < 0` (khi `ballR > height/2`). `yLimit < 0` → mọi y bị clamp lệch; endcap không bao giờ trigger → ball bị đẩy ra ngoài. **Fix:** early-return khi `innerR <= 0` hoặc clamp `Math.max(0, R - ballR)`.
- **`utils/format.ts:25-37`** — `formatThousands(value: number)` dùng `Math.abs` → mất dấu âm silent. Caller có thể truyền số âm (preview balance) → render sai. **Fix:** preserve dấu hoặc tài liệu hoá rõ.
- **`utils/format.ts:64`** — `parseInt(rawDigits, 10)` mất chính xác với input >15 chữ số. **Fix:** guard `if (rawDigits.length > 9) return defaults`.
- **`utils/notificationFormat.ts:78`** — `payment.recorded` luôn render `${money}` kể cả khi `amount === undefined` → output "Admin ghi nhận A → B trả " (trailing space). Test chưa cover. **Fix:** fallback "Đã ghi nhận thanh toán" khi money rỗng.
- **`utils/notificationFormat.ts:62`** — `typeof amount === 'number'` cho phép NaN. **Fix:** `Number.isFinite(amount)`.
- **`utils/themeTransition.ts:25-29`** — Khi `animations_enabled = false` gọi `Uniwind.setTheme(to)` trực tiếp, bypass `state.trigger`. Nếu `state.trigger` thêm side-effect tương lai (telemetry, persist) sẽ leak. **Fix:** vẫn gọi `state.trigger`, để nó tự skip animation bên trong.
- **Test thiếu** — `setHomeViewMode/useHomeViewMode/getHomeViewMode` (3 hàm public của `userPreferences`); `lightning.ts`; edge `clampCircleToCapsule` với `innerR <= 0`; `formatThousands(-150_000)`; `payment.recorded` với `amount=undefined`.

---

## 4. Đề xuất nhỏ — `[nit]` / `[suggestion]`

- `notifications.tsx:36-45` — `bucketOf` tính `startToday` mỗi lần gọi trong loop. Tính 1 lần ngoài rồi pass.
- `notifications.tsx:282-287` — `SkiaFireBorder` cho chip filter quá nặng so với giá trị thẩm mỹ. Border solid đủ.
- `NotificationBell.tsx:19` — `'9+'` ở 10 unread quá sớm. Đổi `99+`.
- `NotificationRow.tsx:51-73` — `iconForType` dùng `startsWith` không cần thiết với type exact.
- `NotificationRow.tsx:69` — `trip.closed` dùng `UserMinus` semantic sai. Nên `Lock` / `Archive`.
- `userPreferences.ts:87-94` — `setHomeViewMode` set cache trước, persist sau (best-effort) — pattern OK nhưng nên unify với `persistPreferencesCache`.
- `effectPicker.ts` — `POOL_BY_VARIANT.accent === INFO_POOL` nhưng `lastPicked.accent` riêng → có thể pick trùng id liên tiếp giữa accent/default. Share key.
- `BouncyDialog.tsx` / `VoroConfirmDialog.tsx` — Effect open fire `hapticMedium()` không guard `animationsEnabled`. Đúng rule (haptic riêng), nhưng UX giật khi user tắt anim.
- `header/index.ts` — Chưa có barrel export. Callsite phải import deep paths.
- `CapsuleShell.tsx` — Skia Canvas thiếu `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"` → screen reader đọc layer trống.
- `notification.service.ts:170` — Title fallback `'Ai đó'` khi dedup gộp mà actorName không truyền. Nên `__DEV__ console.warn` để dev biết caller thiếu.
- `_layout.tsx (main)` — Header centralize sang `GlassCapsuleHeader` rất sạch; nên cập nhật CLAUDE.md mô tả convention header mới.
- Thêm `Promise.allSettled` cho mọi `Promise.all([logAction, notifyXxx])` ở `trip.store.ts` để tránh notify reject vì audit lỗi.

---

## 5. Điểm nổi bật — `[praise]`

- **Architecture rất sạch** ở `capsule header`: math thuần testable → physics hook → render layer; mỗi util có `'worklet'` directive đầy đủ.
- **`notification.service.ts`**: TypeScript chặt (không thấy `: any` trong 611 dòng), pattern fan-out + dedup tách rõ ràng, helper bọc try/catch im lặng đúng pattern `logAction`. `formatNotificationTitle` pure tách riêng dễ test. Resolver `getGroupRecipients` đúng spec rule book (loại virtual / left / actor / setting off). `notifyPaymentRecorded` đã include `target_id: input.paymentId` đúng cho deep-link payment.
- **FancyToast wrapper**: callsite tuân thủ tuyệt đối — grep toàn repo chỉ `useFancyToast.tsx` import `useToast` HeroUI. `fireHapticFor` exhaustive theo variant. Ring buffer per-variant gọn, edge case 1-effect xử lý đúng.
- **`animations_enabled` + `haptics_enabled` lan đầy đủ** xuống mọi Skia primitive (`SkiaConfettiBurst`, `SkiaBreathingHalo`, `SkiaMeshGradient`, `SkiaShimmerCard`, `SkiaStarNest`) và transition contexts (`MorphTransition`, `BlackHoleTransition`). Đây là rule khó enforce, làm rất tốt.
- **`NotificationRow` avatar + type icon overlay** — pattern UX kiểu Slack/Discord, hiển thị actor + loại notif rõ ràng.
- **`notifications.tsx` virtualization tuning** đầy đủ: `initialNumToRender=12`, `maxToRenderPerBatch=6`, `windowSize=7`, `removeClippedSubviews`, `keyExtractor` stable, callback nhận id thay vì closure để `React.memo` skip đúng.
- **`group.service.ts`**: đúng pattern `assertRole(['admin'])` trước mọi mutation, dùng `getAuthUserId()` shared helper, audit `logAction` đầy đủ.
- **Optimistic update + rollback** trong `settings.handleToggleSetting` chuẩn.
- **Test coverage** mới: 167 tests pass, thêm 6 file test cho utils (`capsuleMath`, `explainBalance`, `notification`, `userPreferences`, `haptics`, `moneyInput`).
- **Comment domain** rất chi tiết: SKSL shader của `SkiaFireBorder`, Reanimated quirk của `animations.ts`, Skia 2.4 + Reanimated 4 conflict trong `BlackHoleTransition` đã document rõ. Maintain dễ.
- **`MoneyTextField`** + bỏ raw `keyboardType` ở mọi callsite — DRY, gom logic format VND một chỗ.
- **`constants.ts`** thêm `NOTIF_PAGE_SIZE`, `NOTIF_DEDUP_WINDOW_MS`, `SETTLE_SUGGEST_*` đồng bộ với CLAUDE.md.

---

## 6. Danh sách hành động ưu tiên

### Trước khi merge (blocking)

1. ✋ Wrap `<ToastTestPanel />` trong `__DEV__` hoặc xoá ([src/app/(main)/index.tsx:136](src/app/(main)/index.tsx#L136)).
2. ✋ Sửa default JSON trong [src/db/schema.ts:11](src/db/schema.ts#L11) + viết migration đổi key `notify_expense → notify_activity`, `notify_reminder → notify_smart`.
3. ✋ Migration runtime trong `fetchCurrentUser` ([src/services/user.service.ts](src/services/user.service.ts)) cho user có legacy keys ở Postgres.
4. ✋ Thêm `logAction({ action: 'trip.close' / 'trip.reopen' })` trong [src/stores/trip.store.ts:110-127](src/stores/trip.store.ts#L110-L127).
5. ✋ Refactor [src/utils/userPreferences.ts:96-104](src/utils/userPreferences.ts#L96-L104) — bỏ top-level `subscribe`, expose `bindAuthStoreSync()` gọi từ `_layout.tsx`.
6. ✋ Sửa hooks order trong [src/components/header/GlassCapsuleHeader.tsx:65-69](src/components/header/GlassCapsuleHeader.tsx#L65-L69) — render cả 2 nhánh hoặc tách component cha.
7. ✋ Cleanup vô điều kiện `frameCallback.setActive(false)` trong [src/components/header/useCapsulePhysics.ts:340-346](src/components/header/useCapsulePhysics.ts#L340-L346).
8. ✋ Lưu timeoutId ref + clear trong [src/contexts/BlackHoleTransition.tsx:614-616](src/contexts/BlackHoleTransition.tsx#L614-L616).
9. ✋ Sửa `frameCallback.isActive` → `useRef<boolean>` trong [src/components/header/useCapsulePhysics.ts:323-325](src/components/header/useCapsulePhysics.ts#L323-L325).

### Nên fix trong sprint này (important)

10. Dedup query notification thêm filter `trip_id` ([src/services/notification.service.ts:131](src/services/notification.service.ts#L131)).
11. `getGroupRecipients` skip khi `userRel === null` thay vì default true ([src/services/notification.service.ts:66](src/services/notification.service.ts#L66)).
12. Audit luồng edit expense — fire `notifyExpenseEvent('expense.edited', ...)` (hoặc xoá type khỏi enum nếu chưa dùng).
13. `markAsRead` snapshot items trước khi tính ([src/stores/notification.store.ts:90](src/stores/notification.store.ts#L90)).
14. Cursor `loadMore` tie-break compound `(created_at, id)` ([src/stores/notification.store.ts:62](src/stores/notification.store.ts#L62)).
15. `signOut` reset `notification.store` ([src/stores/auth.store.ts:170](src/stores/auth.store.ts#L170)).
16. Empty state notifications phân biệt theo filter ([src/app/(main)/notifications.tsx:311](src/app/(main)/notifications.tsx#L311)).
17. Deeplink notification map theo type (settlement / requests / highlight target).
18. Confirm/undo cho swipe-delete notification.
19. Tracking unmount guard cho `fetchMyGroups` ([src/app/(main)/notifications.tsx:101](src/app/(main)/notifications.tsx#L101)).
20. Memoize palette trong `MeshEmeraldToast/MeshRoseToast/MeshAmberToast/MeshSoftToast`.
21. `useEffect` sync `setNewName` khi `profile.display_name` đổi ([src/app/(main)/settings.tsx](src/app/(main)/settings.tsx)).
22. Lift handler ra ngoài memo trong [src/components/header/headerSlots.tsx:172](src/components/header/headerSlots.tsx#L172).
23. Self `setActive(false)` từ worklet khi `restingCounter >= RESTING_FRAMES` ([src/components/header/useCapsulePhysics.ts:168](src/components/header/useCapsulePhysics.ts#L168)).
24. `ScrollView` → `FlatList` cho danh sách nhóm ở home.
25. `SuckTarget` chỉ wrap row được tap (lazy/runtime register).
26. Guard `innerR <= 0` trong `clampCircleToCapsule`.
27. Migration legacy chạy 1 lần trên DB Supabase + xoá field cũ.
28. Đồng bộ animation route (`settings`, `groups/[id]`) với CLAUDE.md hoặc cập nhật doc.

### Sau merge (suggestion / nit)

- Test cho `setHomeViewMode`, `lightning.ts`, edge `innerR<=0`, `formatThousands(-)`, payment notification `amount=undefined`.
- A11y `accessibilityElementsHidden` cho Skia Canvas.
- A11y `announceForAccessibility` cho fancyToast.
- Barrel export `components/header/index.ts`.
- `relativeTime` invalidate mỗi 60s qua `useEffect` + `key`.
- `99+` cho NotificationBell badge.
- Cập nhật CLAUDE.md với convention header mới sau khi centralize.

---

**Tổng kết:** Branch có chất lượng kiến trúc tốt và test coverage ổn (167/167 pass, TS clean), nhưng **không nên merge** trước khi xử lý 9 vấn đề `[blocking]` ở §2. Phần lớn gap là về cleanup/audit/migration chứ không phải lỗi logic core — fix nhanh nếu nhặt đúng.
