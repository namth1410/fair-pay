# Code Review — Fair Pay

> Báo cáo review toàn bộ repository ngày 2026-05-07.
> Phạm vi: `src/` (~23.000 LOC, 149 file TS/TSX) + config + db schema + supabase migrations.
> Phương pháp: 5 agent chuyên trách review song song theo layer (services / stores / utils & tests / components & screens / config & db).
>
> **Cập nhật 2026-05-07:** Đã fix 9/10 finding `[blocking]` (3.1–3.9) + 4 finding `[important]` (4.1, 4.9, 4.10, 4.12). Còn lại 1 `[blocking]` (`splitByRatio` clamp) và 16 `[important]` + 22 `[nit]`.

---

## 1. Tổng quan

Codebase Fair Pay được tổ chức **rất tốt**, tuân thủ phần lớn quy ước trong `CLAUDE.md`:

- Pattern uncontrolled-ref + delayed mount cho `BottomSheetTextInput` áp dụng nhất quán (không lặp bug IME tiếng Việt).
- Auth helper `getAuthUserId()` 30s-cache + `clearAuthCache()` được dùng đúng trong service layer.
- Validate input (`validateAmount`, `validateName`) ở boundary, có `assertRole` ở các mutation `group.service.ts`.
- TypeScript strict, `no-explicit-any` ở ESLint, không tìm thấy `: any` trong service.
- Edge Function có error wrapper, R2 helper defensive.
- Notification dedup logic tách riêng utils, có unit test pure.
- Test coverage tốt cho utils (split, settlement, balance, validate, format, notification).

Sau đợt fix 2026-05-07, mọi mutation expense/payment/trip đã có `assertRole` + audit log + notify ở service layer, schema SQLite đồng bộ với types, signOut reset cross-store, conditional hook violation đã được sửa.

---

## 2. Bảng đánh giá theo module

| Module | Điểm | Mức độ rủi ro | Ghi chú |
|---|---|---|---|
| `src/services/` | 9/10 | Thấp | Đã thêm `assertRole` + audit/notify cho expense/payment/trip + filter `group_id` join_requests. Còn race dedup notification (4.2) |
| `src/stores/` | 8/10 | Thấp | Đã reset cross-store khi logout + idempotent listener. Còn race trong loadXxx |
| `src/utils/` | 8/10 | Trung bình | `splitByRatio` clamp gây sum < total **(còn `[blocking]`)**. Đã fix `validateSplits` integer guard + `validateName` filter ký tự ẩn |
| `src/__tests__/` | 8/10 | Thấp | Coverage tốt cho happy path. Đã thêm test cho control-char/zero-width name. Thiếu edge case orphan / NaN |
| `src/components/` & `src/app/` | 8/10 | Thấp | Đã fix conditional hook + selector pattern ở `groups/[id].tsx`. Còn setTimeout không cleanup trong context transitions |
| `src/config/` & `src/db/` | 8/10 | Thấp | Đã bump SCHEMA_VERSION 2, thêm `updated_at` + trigger, fix settings JSON default. Còn schema mismatch nhiều bảng + RLS không track |
| Tooling (`tsconfig`, `eslint`, `package.json`) | 8/10 | Thấp | Thiếu `eslint-plugin-react-hooks`, dep version pinning chưa nhất quán |
| **Tổng** | **8.3/10** | **Thấp–Trung bình** | Sau fix đợt 1+2, code đã sẵn sàng cho production. Còn 1 `[blocking]` về tính đúng của split + 16 `[important]` cần xử lý |

---

## 3. Findings ưu tiên cao — phải fix trước

> Các finding `[blocking]` dưới đây ảnh hưởng **bảo mật, tính đúng đắn dữ liệu, hoặc rules-of-hooks**. Cần xử lý trước khi release tiếp theo.
>
> 9 finding `[blocking]` đã fix trong commit 2026-05-07 (createExpense/createPayment assertRole, audit+notify wiring cho expense/payment/trip, user.service dùng getAuthUserId, signOut reset cross-store, onAuthStateChange unsubscribe, conditional hook ở trips/[id], expense_presets.updated_at + trigger, settings JSON default keys mới + migration v2).

### `[blocking]` 3.1 — `splitByRatio` clamp khiến tổng < `total` (vi phạm BR-02)

**File:** [src/utils/split.ts:200-209](src/utils/split.ts)

Khi nhiều người round-up làm `remaining < 0`, người cuối nhận `Math.max(0, remaining)` → tổng splits **thiếu so với `total`**. Test chính thừa nhận điều này (`split.test.ts:455` — `expect(sum).toBeLessThanOrEqual(10000)`). Nếu UI gọi `validateSplits` ngay sau, sẽ báo "Tổng chia khác tổng khoản chi" → block user. Balance cũng lệch.

**Fix:** Khi `remaining < 0`, "rút" 1.000đ từ các người round-up nhiều nhất (largest remainder method) cho đến khi cân; hoặc scale lại tỷ lệ rounding cho `n-1` người đầu.

---

## 4. Findings quan trọng — nên fix sớm

### ~~`[important]` 4.1 — `rejectJoinRequest` thiếu filter `groupId` (cross-tenant)~~ ✅ Đã fix 2026-05-07

Đã thêm `.eq('group_id', groupId)` vào fetch + update của cả `approveJoinRequest` và `rejectJoinRequest` ([src/services/group.service.ts](src/services/group.service.ts)). Chặn cross-tenant spoof khi admin nhóm A truyền `requestId` của nhóm B.

### `[important]` 4.2 — `createNotifications` race condition trong dedup

**File:** [src/services/notification.service.ts:122-211](src/services/notification.service.ts)

Dedup logic: SELECT → tách update/insert → execute. Hai event cùng `(group, type, actor, user)` chạy concurrent đều SELECT empty → cả hai INSERT → có 2 row chưa đọc cùng dedup key → bypass dedup window 10 phút. User thấy 2 notif "đã thêm 1 khoản chi" thay vì 1 notif "đã thêm 2".

**Fix:** Tạo UNIQUE INDEX partial trên `(user_id, group_id, type, actor_id) WHERE read_at IS NULL` + dùng `ON CONFLICT DO UPDATE` để gộp atomic. Hoặc move dedup vào server-side RPC.

### `[important]` 4.3 — Mutation không check `groups.deleted_at IS NULL`

**File:** [src/services/group.service.ts:356](src/services/group.service.ts) và các mutation khác (`createTrip`, `updateGroup`, `addVirtualMember`)

`assertRole` chỉ check membership active, không check group active. Admin có thể (do bug UI hoặc malicious) thao tác trên nhóm đã xóa.

**Fix:** Thêm helper `assertGroupActive(groupId)` hoặc join `groups` trong `assertRole` để check `deleted_at IS NULL`.

### `[important]` 4.4 — Race condition trong `loadExpenses`/`loadTrips` dùng chung `isLoading`

**File:** [src/stores/trip.store.ts:97-105](src/stores/trip.store.ts)

Cùng flag `isLoading` chia sẻ giữa `loadTrips`/`loadExpenses`. Action xong trước reset flag → spinner UI biến mất sớm. Đồng thời "stale-response overwrite": nếu user navigate trip khác trong khi load đang chạy, response cũ về sau ghi đè state hiện tại.

**Fix:** Track request ID hoặc tách `isLoadingTrips`/`isLoadingExpenses` riêng:
```ts
let currentReq = 0;
loadExpenses: async (tripId) => {
  const reqId = ++currentReq;
  const expenses = await fetchExpenses(tripId);
  if (reqId !== currentReq) return; // bị superseded
  set({ currentExpenses: expenses });
}
```

### `[important]` 4.5 — `loadBalances` luôn fetch lại expenses+payments → N+1 round-trip

**File:** [src/stores/trip.store.ts:176](src/stores/trip.store.ts)

Sau mỗi `addExpense`/`removeExpense`/`addPayment`/`removePayment`:
```ts
await get().loadExpenses(tripId);
await get().loadBalances(tripId);  // calculateBalances cũng fetch expenses+payments
```
→ 3-5 round-trip Supabase tuần tự. Nên `Promise.all` hoặc compute balance từ state hiện có.

### `[important]` 4.6 — Optimistic update notification không rollback khi API fail

**File:** [src/stores/notification.store.ts:99](src/stores/notification.store.ts)

`markAsRead`, `markAllAsRead`, `remove` set optimistic rồi swallow error trong `catch {}`. UI hiển thị đã đọc/đã xóa nhưng server vẫn unread → lần `refresh` kế tiếp item nhảy lại → flicker. `remove()` còn nguy hiểm hơn — user nghĩ đã xóa nhưng vẫn còn.

**Fix:** Snapshot trước khi set rồi rollback trong catch, hoặc trigger `get().refresh()` trong catch.

### `[important]` 4.7 — `setTimeout` trong context transitions không cleanup

**Files:**
- [src/contexts/BlackHoleTransition.tsx:595-637](src/contexts/BlackHoleTransition.tsx) — 4 timeouts (80ms, 1300ms, 1450ms, 600ms)
- [src/contexts/MorphTransition.tsx:264](src/contexts/MorphTransition.tsx)

Khi provider unmount giữa transition (vd logout while animating), callback chạy gọi `setIsSucking`, `setPieces`, `o.onCovered()` → React warning "Can't perform state update on unmounted". `o.onCovered()` thường gọi `router.push` → navigate trên router đã unmount.

**Fix:** Lưu IDs vào `useRef<number[]>([])`, push tất cả timeouts, clear trong cleanup. Dùng `cancelAnimation()` cho Reanimated shared values.

### `[important]` 4.8 — `balance.ts` bỏ qua orphan member im lặng → tổng ≠ 0

**File:** [src/utils/balance.ts:53-62](src/utils/balance.ts)

`if (split.memberId in balanceMap)` → nếu split trỏ tới member đã rời nhóm/bị xóa khỏi `members` mảng truyền vào, code bỏ qua. Hệ quả: payer được +amount đầy đủ, splits bị mất → total ≠ 0 (vi phạm TC-05). Tương tự với `paidBy` không có trong members.

**Fix:** Hoặc throw lỗi rõ ràng, hoặc luôn include "ghost" member để cân bằng. Tối thiểu log warning.

### ~~`[important]` 4.9 — `validateSplits` không check `Number.isInteger`~~ ✅ Đã fix 2026-05-07

Đã thêm guard `Number.isFinite + Number.isInteger` ở đầu `validateSplits` ([src/utils/split.ts](src/utils/split.ts)) trước khi check sum, để chặn float/NaN/Infinity.

### ~~`[important]` 4.10 — `validateName` không filter control char / zero-width~~ ✅ Đã fix 2026-05-07

Đã thêm 2 regex `CONTROL_CHAR_RE` (C0 + DEL/C1) và `ZERO_WIDTH_RE` (ZWSP/ZWNJ/ZWJ + BOM) trong [src/utils/validate.ts](src/utils/validate.ts), kèm 2 test case mới trong [src/__tests__/validate.test.ts](src/__tests__/validate.test.ts).

### `[important]` 4.11 — SQLite migrations không atomic

**File:** [src/db/migrations.ts:11-25](src/db/migrations.ts)

`runMigrations` chạy `migration.up()` và INSERT version trong 2 statement riêng — không bọc transaction. Nếu app crash giữa 2 bước, version không ghi nhưng `up()` đã chạy → lần boot sau chạy lại migration gây lỗi.

**Fix:** `db.withTransactionAsync(async () => { await up(db); await runAsync(...) })`.

### ~~`[important]` 4.12 — `useGroupStore()` không selector → re-render mọi field~~ ✅ Đã fix 2026-05-07

Đã refactor [src/app/(main)/groups/[id].tsx](src/app/(main)/groups/[id].tsx) sang `useShallow` (zustand v5 built-in `zustand/react/shallow`) cho cả `useGroupStore` + `useTripStore`, và selector trực tiếp cho `useAuthStore.user`. Component chỉ re-render khi shape của object subscribe đổi, không còn react theo `balanceSummary`/`isLoading` không liên quan.

### `[important]` 4.13 — ErrorBoundary không có `componentDidCatch`

**File:** [src/components/common/ErrorBoundary.tsx:87-106](src/components/common/ErrorBoundary.tsx)

Chỉ có `getDerivedStateFromError`, không log/report. Crash production không được capture → dev không biết user gặp gì.

**Fix:**
```ts
componentDidCatch(error, info) {
  console.error('[ErrorBoundary]', error, info.componentStack);
  // Hoặc tích hợp Sentry/Crashlytics nếu có
}
```

### `[important]` 4.14 — Schema mismatch nhiều bảng SQLite vs Postgres types

**File:** [src/db/schema.ts](src/db/schema.ts) vs [src/types/database.types.ts:118-167](src/types/database.types.ts)

`NotificationRow`, `FeedbackRow`, `GroupAvatarUploadRow`, `ExpenseImageUploadRow` được khai báo TypeScript nhưng KHÔNG có CREATE TABLE trong SQLite. Nếu code có local query đến các bảng này (cache offline) sẽ fail. `_schema_version` định nghĩa `version PRIMARY KEY` → INSERT lần 2 cùng version sẽ unique constraint fail.

**Fix:** Xác định rõ bảng nào local-only, bảng nào server-only. Bảng server-only thì tách type sang `database.server.types.ts`. Đổi `_schema_version` thành `INSERT OR IGNORE`.

### `[important]` 4.15 — `is_virtual` type lệch giữa Postgres (bool) và SQLite (0/1)

**File:** [src/types/database.types.ts:31](src/types/database.types.ts)

Type chỉ khai báo `is_virtual: number`. Data Supabase trả `boolean`, SQLite raw trả `0|1`. CLAUDE.md cảnh báo nhưng type vẫn chưa phản ánh union.

**Fix:** Đổi thành `is_virtual: boolean | number` hoặc tách `GroupMemberRowSqlite` vs `GroupMemberRowPg`.

### `[important]` 4.16 — Race trong `reset-password.tsx` giữa parser & timeout

**File:** [src/app/(auth)/reset-password.tsx:128-133](src/app/(auth)/reset-password.tsx)

Timeout 3s set state `invalid` nếu chưa `handledRef.current=true`. Nếu link chậm về (>3s), user thấy `invalid` thoáng qua rồi `handle` resolve `ok` cũng không update do `handledRef.current=true` set sau khi state đã invalid.

**Phụ:** dòng 107 `if (session) await supabase.auth.signOut();` — log out user dù URL không hợp lệ, gây bất tiện.

**Fix:** Trong `handle()` khi `result.ok`, kiểm tra `if (!cancelled)` rồi set ref + state. Đặt `signOut` SAU khi token được verify hợp lệ.

### `[important]` 4.17 — `approveJoinRequest` race khi 2 admin cùng duyệt

**File:** [src/services/group.service.ts:224-299](src/services/group.service.ts)

Logic: fetch `status='pending'` → check oldMember → update OR insert → update `status='approved'`. Hai admin cùng chạy có thể double-fire `logAction` + `notifyJoinResolved` (spam notification kép).

**Fix:** Update cuối thêm `.eq('status', 'pending')`, kiểm tra `count > 0` trước khi log/notify. Lý tưởng nhất chuyển vào RPC/transaction.

### `[important]` 4.18 — `themeTransition.ts` import Uniwind ở module level

**File:** [src/utils/themeTransition.ts:2](src/utils/themeTransition.ts)

Không có guard cho web/test. Component test transitive import file này sẽ fail vì uniwind không setup ở jest.

**Fix:** Lazy import hoặc mock Uniwind ở `jest.setup`.

### `[important]` 4.19 — RLS policies không có trong code

**File:** [supabase/migrations/](supabase/migrations/)

Chỉ có 1 migration SQL (`20260501_add_expense_image.sql`) — chỉ ENABLE RLS không CREATE POLICY. Các bảng quan trọng khác (`groups`, `expenses`, `payments`, `notifications`, `users`, `expense_presets`) — RLS được set thủ công trên Dashboard, không track trong code → nguy cơ lệch giữa môi trường, không có audit/diff được.

**Fix:** `supabase db dump --schema public > supabase/migrations/0001_initial.sql` để có baseline.

### `[important]` 4.20 — `SecureStore` adapter không xử lý platform web

**File:** [src/config/supabase.ts:6-16](src/config/supabase.ts)

`expo-secure-store` không support web → build web (script `expo start --web` có trong package.json) sẽ crash khi `getItemAsync`.

**Fix:** Detect `Platform.OS === 'web'` → fallback `localStorage` adapter, hoặc bỏ web script.

---

## 5. Findings nhỏ — fix sau

### `[nit]` 5.1 — Memo & re-render

- [src/components/trip/ExpensesTab.tsx:84-93](src/components/trip/ExpensesTab.tsx) — `renderItem` inline, `getMemberName` không memo. Pre-index `members` thành Map qua `useMemo`, tách `renderExpense = useCallback(...)`.
- [src/components/trip/SettlementTab.tsx:62-63](src/components/trip/SettlementTab.tsx) — `members.map(...)` không memo → ChipPicker re-render thừa.
- [src/components/trip/BalancesTab.tsx:30](src/components/trip/BalancesTab.tsx) — `handleExport` không memo (trivial).
- [src/app/(main)/(tabs)/index.tsx:140-146](src/app/(main)/(tabs)/index.tsx) — inline closure `onPress={() => blackHole.suck(...)}` trong `.map()` → bypass memo nếu list lớn.

### `[nit]` 5.2 — `splitEqualWithExplanation`: text "trừ bớt" / "cộng thêm" sai dấu

**File:** [src/utils/split.ts:120-126](src/utils/split.ts)

So sánh `total - rounded*n` thay vì `lastAmount - roundedPerPerson` → text hiển thị ngược nghĩa với hành vi thực khi `lastAmount > roundedPerPerson`.

### `[nit]` 5.3 — Settlement adjust last có thể tạo amount không bội 1.000đ

**File:** [src/utils/settlement.ts:66-78](src/utils/settlement.ts)

Edge case: input balance không bội 1000 (`333333, -166666, -166667`). Nên `Math.round((totalDebt - totalSettlement) / 1000) * 1000` để đảm bảo `diff % 1000 === 0`.

Đồng thời: `adjusted` có thể về `0` → bỏ qua không cập nhật → giao dịch cuối còn 1000đ trong khi tổng debt = 0 → over-pay.

### `[nit]` 5.4 — `explainBalance.ts` dùng `find` thay vì cộng dồn duplicate splits

**File:** [src/utils/explainBalance.ts:72](src/utils/explainBalance.ts)

`splits.find(...)` chỉ lấy entry đầu tiên. Nếu data có 2 entry cùng member (data corruption), `myShare` sai. `computeBalances` thì cộng cả 2 → lệch giữa hai hàm.

**Fix:** `splits.filter(...).reduce(...)`.

### `[nit]` 5.5 — `formatVND(-150_000)` ra `"-150.000đ"` không cảnh báo

**File:** [src/utils/format.ts:6-8](src/utils/format.ts)

Spec amount luôn dương, nên có thể `Math.abs()` hoặc throw để bắt bug sớm.

### `[nit]` 5.6 — `r2.ts` không strip query string / fragment

**File:** [src/utils/r2.ts:12-13](src/utils/r2.ts)

Nếu publicUrl có `?v=abc` (cache buster), key extract chứa cả query string → backend delete fail.

### `[nit]` 5.7 — `forgot-password.tsx` cooldown effect deps khó đọc

**File:** [src/app/(auth)/forgot-password.tsx:53](src/app/(auth)/forgot-password.tsx)

`useEffect(..., [cooldown > 0])` boolean expression làm dep — confuse, khó audit. Đổi sang `[cooldown]` với `useRef` cho interval ID.

### `[nit]` 5.8 — `register.tsx` không dùng `validateName` từ utils

**File:** [src/app/(auth)/register.tsx:33-54](src/app/(auth)/register.tsx)

Tự check inline 2-50 chars thay vì gọi shared `validateName`. Reuse để nhất quán, đồng thời nhận lợi ích từ filter control-char (sau khi fix 4.10).

### `[nit]` 5.9 — `audit.service.ts` thiếu nhiều `ACTION_LABELS`

**File:** [src/services/audit.service.ts:17-27](src/services/audit.service.ts)

Thiếu key `'group.delete'`, `'group.update'`, `'trip.create'`, `'trip.close'`, `'member.remove'`. Sau khi fix 3.3, cần đồng bộ.

### `[nit]` 5.10 — `MembersTab.tsx` nối hex alpha thủ công

**File:** [src/components/group/MembersTab.tsx:20,30](src/components/group/MembersTab.tsx)

`backgroundColor: color + '22'` — vỡ nếu `color` là `rgb(...)` hoặc `oklch(...)`. Dùng theme token `c.surfaceAlt`/`c.primarySoft`.

### `[nit]` 5.11 — Supabase URL/anon key chỉ throw trong `__DEV__`

**File:** [src/config/constants.ts:6-13](src/config/constants.ts)

Production build không throw nếu `EXPO_PUBLIC_*` thiếu. Nên throw cả prod để debug nhanh.

### `[nit]` 5.12 — Edge Function CORS `*` quá lỏng

**File:** [supabase/functions/_shared/auth.ts:53](supabase/functions/_shared/auth.ts)

Whitelist origin theo `EXPO_PUBLIC_APP_URL` hoặc `http://localhost` cho dev (defense-in-depth khi đã có Bearer JWT).

### `[nit]` 5.13 — `app.json` thiếu `runtimeVersion`

**File:** [app.json](app.json)

OTA updates có thể crash khi native module thay đổi. Thêm `"runtimeVersion": { "policy": "sdkVersion" }`.

### `[nit]` 5.14 — `package.json` deps version pinning không nhất quán

**File:** [package.json:14-64](package.json)

Mix `^`, `~`, pin chính xác. `lucide-react-native: ^1.8.0` (mới release 1.x) và `heroui-native: ^...` có thể minor breaking giữa máy dev. Pin chính xác hoặc dựa vào `package-lock.json` + CI dùng `npm ci`.

### `[nit]` 5.15 — Thiếu `eslint-plugin-react-hooks`

**File:** [eslint.config.mjs](eslint.config.mjs)

Thiếu `react-hooks/exhaustive-deps`, `react-hooks/rules-of-hooks` → bug như 3.7 không bị catch.

### `[nit]` 5.16 — `notification.service.ts:197-201` spread `params.data` SAU `count`/`target_ids`

**File:** [src/services/notification.service.ts:197-201](src/services/notification.service.ts)

```ts
data: { count: 1, target_ids: [...], ...(params.data ?? {}) }
```
Caller truyền `count`/`target_ids` trong `data` sẽ ghi đè. Spread `...params.data` TRƯỚC mới đúng intent.

### `[nit]` 5.17 — `groups/[id].tsx` `findMyRole` async không cancellation guard

**File:** [src/app/(main)/groups/[id].tsx:67-83](src/app/(main)/groups/[id].tsx)

Effect async không có `cancelled` flag — `currentGroupMembers` đổi nhanh có thể flicker role.

### `[nit]` 5.18 — `useDominantColor` có 2 cơ chế cancel chồng chéo

**File:** [src/hooks/useDominantColor.ts:25-44](src/hooks/useDominantColor.ts)

Đã có `cancelled` flag ở effect 2 nhưng vẫn giữ `isMounted` ref ở effect 1 → dư thừa, gây hoang mang.

### `[nit]` 5.19 — `joinGroupByCode` không cooldown spam request

**File:** [src/services/group.service.ts:142-204](src/services/group.service.ts)

User reject rồi re-request liên tục → admin bị spam pending. Thêm cooldown 24h hoặc check `last reviewed_at < N giờ thì throw`.

### `[nit]` 5.20 — `notifications.tsx:295` Pressable hitSlop=6 quá nhỏ

**File:** [src/app/(main)/(tabs)/notifications.tsx:295-304](src/app/(main)/(tabs)/notifications.tsx)

Tăng lên `{top:8,bottom:8,left:8,right:8}` để đạt 44pt iOS HIG.

### `[nit]` 5.21 — `EXPENSE_CATEGORIES` lặp trong CHECK constraint SQL

**File:** [src/db/schema.ts:60](src/db/schema.ts)

Hardcode danh sách category ở 2 chỗ SQL. Khi thêm category mới phải sửa 4 chỗ. Generate SQL từ TS const hoặc accept duplication có comment.

### `[nit]` 5.22 — `(tabs)/_layout.tsx` dùng `as any`

**File:** [src/app/(main)/(tabs)/_layout.tsx:23](src/app/(main)/(tabs)/_layout.tsx)

Vi phạm rule "không dùng `: any`" trong CLAUDE.md (dù là TS rule cho service layer). Cân nhắc tạo type union/adapter.

---

## 6. Test còn thiếu — đề xuất

1. **`balance.test.ts`**: orphan member trong splits, virtual member là payer.
2. **`split.test.ts`**: `validateSplits` với amount float, `splitByRatio` với `total < n*1000`, ratio âm/NaN, `splitEqualWithExplanation` case `lastAmount > roundedPerPerson`.
3. **`settlement.test.ts`**: input không bội 1000 (e.g. `2500, -2500`), creditor/debtor sát TOLERANCE, 100+ members chống infinite loop, `adjusted = 0` và `< 0`.
4. **`validate.test.ts`**: control char / zero-width / emoji-only name, email > 254, amount = `Infinity` / `NaN` / `MAX_SAFE_INTEGER + 1`.
5. **`notification.test.ts`**: missing `fromName`/`toName`/`amount` cho payment.received → không trailing space, fake type → fallback string.
6. **`format.test.ts`** (mới): `formatVND(0)`, `formatVND(-1)`, `formatBalance(0)`.
7. **`explainBalance.test.ts`**: duplicate split entries cùng member, date timezone khác.
8. **`r2.test.ts`**: URL có query string / fragment, encoded chars (`%20`).

---

## 7. Điểm tốt — `[praise]`

- **`auth.helper.ts` cache 30s + `clearAuthCache()`**: thiết kế gọn, comment rõ mục đích, ngăn N round-trips trong burst sequence (createExpense + logAction + notifyXxx). Được gọi đúng trong `signOut` ([src/stores/auth.store.ts:171](src/stores/auth.store.ts)).
- **Expense rollback** ([src/services/expense.service.ts:116-120](src/services/expense.service.ts)): tự xóa expense khi splits insert fail — đúng pattern transaction giả lập trên client.
- **`getGroupRecipients` filter ảo + setting + actor + left_at trong 1 hàm** — DRY, đúng spec virtual member không bị notify.
- **`fetchUserBalanceSummary` Promise.all + Map pre-index** ([src/services/group.service.ts:596-654](src/services/group.service.ts)): tránh N+1 đẹp, comment "Pre-index by trip_id / group_id for O(1) lookup" rất rõ.
- **Edge Function error parsing**: wrap `retryAfter`, parse `context.json()`, fallback message — UX tốt cho rate-limit case.
- **`feedback.service.ts` sanitize input**: regex strip control chars + cap newlines — chống null-byte injection và DoS spam.
- **TypeScript discipline trong service**: không có `: any` trong service layer (đúng rule). Cast `as Type` được dùng đúng pattern.
- **Comment giải thích "vì sao"** (chứ không chỉ "what"): vd "Lấy TẤT CẢ members (kể cả đã rời) vì expense/payment của họ vẫn ảnh hưởng đến balance" — tránh người sau xóa nhầm filter.
- **`updateMemberRole` được mark `@deprecated` với context dài** giải thích invariant 1-admin và lý do giữ signature — tốt cho maintainer tương lai.
- **Pattern try/finally cho `isLoading`**: khi fetch fail, `isLoading` luôn được reset → không lock-out UI. Áp dụng nhất quán ở mọi store.
- **Empty constant `EMPTY_SUMMARY`** ([src/stores/group.store.ts:48](src/stores/group.store.ts)): giữ referential equality, tốt cho selector.
- **`split.ts` pattern "người cuối nhận remainder"**: đúng spec, có clamp `Math.max(0, ...)` ngừa âm. Có 2 nhánh (`total >= n*1000` round 1000đ, fallback nhỏ chia 1đ) — fair.
- **`balance.ts`**: pure function, dùng số nguyên 100%, không float drift.
- **`format.ts` tách `formatThousands`** cho UI thread (Reanimated worklet không gọi `toLocaleString`) — kiến trúc tốt.
- **`seedGradient.ts`**: dùng `>>>` (unsigned shift) tránh negative modulo — comment giải thích rõ. Deterministic.
- **`r2.ts` defensive**: reject URL không match base, tránh delete arbitrary keys.
- **Test coverage**: 11 file test, integration test full-cycle (expense → balance → settlement → payment), nhiều edge case.
- **Pattern uncontrolled-ref + delayed mount** áp dụng nhất quán ở mọi BottomSheet có TextInput tiếng Việt — không lặp lại bug IME.
- **Snap points + keyboard config** đúng pattern ở mọi sheet (`enableDynamicSizing={false}` + `snapPoints` + `keyboardBehavior="extend"`).
- **`useFocusEffect` polling on focus** cho unread badge — không setInterval, đúng quy ước CLAUDE.md.
- **`(tabs)/_layout.tsx`** giữ screens mounted (Home/Notifications/Presets/Settings) — chuyển tab instant.
- **Optimistic updates** ở settings (`handleToggleSetting`) với rollback khi service fail.
- **Supabase client RN-correct**: `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`, dùng `SecureStore` adapter — pattern chuẩn cho Expo.
- **Strict TypeScript**: bật đủ `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`. Path alias `@/*` được config nhất quán cả tsconfig + jest.
- **Không có hardcoded secrets**: SUPABASE_URL/ANON_KEY/R2_PUBLIC_BASE_URL đều từ `process.env.EXPO_PUBLIC_*`. Edge Functions dùng `Deno.env.get()` cho R2 keys + service role.
- **SQLite pragmas đúng**: WAL mode + foreign keys ON ngay khi `openDatabaseAsync`.
- **ESLint rules nghiêm**: `@typescript-eslint/no-explicit-any: error`, `eqeqeq: error`, `no-console: warn (allow warn/error)`, `no-throw-literal: error`, `simple-import-sort` — match yêu cầu CLAUDE.md.
- **`newArchEnabled: true`** đã enable New Architecture cho Expo SDK 55.
- **Expo build properties**: ABI filter `arm64-v8a, armeabi-v7a` + minify + shrink resources cho release Android — giảm APK size.

---

## 8. Danh sách hành động ưu tiên

> Theo thứ tự khuyến nghị fix.

### ✅ Đã fix (2026-05-07)

**Đợt 1 — `[blocking]`:**

- Conditional hook ở `trips/[id]/index.tsx`.
- `assertRole` + verify cross-trip/group membership cho `createExpense` + `createPayment`.
- `logAction` + `notifyXxxEvent` cho mọi mutation expense/payment/trip (đặt ở service layer, xóa duplicate ở `trip.store`).
- `user.service.ts` dùng `getAuthUserId()` shared.
- `signOut` reset cross-store (group/trip/notification/preset).
- `onAuthStateChange` lưu subscription module-scope, idempotent re-init.
- Migration v2 SQLite: thêm `expense_presets.updated_at` + trigger, update default settings JSON, migrate row có key legacy (`notify_expense` → `notify_activity`).

**Đợt 2 — `[important]`:**

- 4.1: `approveJoinRequest` + `rejectJoinRequest` thêm filter `group_id` (chặn cross-tenant spoof).
- 4.9: `validateSplits` thêm guard `Number.isFinite + Number.isInteger`.
- 4.10: `validateName` thêm regex filter control-char + zero-width, kèm test cases mới.
- 4.12: `groups/[id].tsx` chuyển sang `useShallow` selector (group + trip store) + selector trực tiếp cho `auth.user`.

### Còn lại — `[blocking]` (correctness)

1. **Fix `splitByRatio`** để tổng = total (3.1).

### Tuần tiếp theo — `[important]` (data integrity & UX)

2. Add UNIQUE INDEX partial cho dedup notification + `ON CONFLICT DO UPDATE` (4.2).
3. Add `assertGroupActive` cho mutations (4.3).
4. Tách `isLoading` riêng cho từng action + request-ID guard (4.4) + `Promise.all` cho `loadBalances` (4.5).
5. Rollback optimistic update notification khi fail (4.6).
6. Cleanup `setTimeout` trong `BlackHoleTransition` + `MorphTransition` (4.7).
7. Handle orphan member trong `balance.ts` (4.8).
8. Wrap migrations trong `withTransactionAsync` (4.11).
9. Add `componentDidCatch` cho ErrorBoundary (4.13).
10. Đồng bộ schema SQLite/Postgres types + `is_virtual` union type (4.14, 4.15).
11. Race fix `reset-password.tsx` (4.16).
12. Approve race + double-fire (4.17) — *Note: filter `group_id` đã thêm ở 4.1, nhưng UNIQUE INDEX cho status='pending' để chặn double-update vẫn cần.*
13. Lazy import / mock Uniwind cho `themeTransition` (4.18).
14. Dump RLS vào migration file (4.19).
15. SecureStore web fallback (4.20).

### Sau đó — `[nit]` & test

- Bổ sung test theo §6.
- Thêm `eslint-plugin-react-hooks`.
- Memo các renderItem callback (5.1).
- Pin dependencies, thêm `runtimeVersion`, whitelist CORS, throw env vars trong production.

---

## 9. Phương pháp & phạm vi

- **Tool:** 5 agent chuyên trách, mỗi agent đọc đầy đủ source theo domain rồi tổng hợp finding.
- **Phạm vi:** Toàn bộ `src/` (149 file, ~23K LOC), `supabase/` migrations + edge functions, root config (`package.json`, `tsconfig.json`, `app.json`, `eslint.config.mjs`, `babel.config.js`).
- **Không nằm trong phạm vi:** `node_modules/`, generated build artifacts, `.expo/`, lock files. Không kiểm tra runtime behavior (không chạy `npx jest` hoặc `npx tsc`).
- **Lưu ý chính xác:** Một số finding có đường dẫn file:dòng được agent quan sát ở thời điểm review — nếu file đã thay đổi sau, line number có thể lệch. Luôn dùng grep để xác minh trước khi fix.

---

*Báo cáo tự động sinh bởi `/code-review-excellence` — 2026-05-07.*
