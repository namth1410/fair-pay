# CLAUDE.md — Fair Pay

## Dự án

Ứng dụng chia tiền nhóm cho React Native (Expo 55) + Supabase + Zustand + HeroUI Native.

## Lệnh thường dùng

```bash
npx jest              # Chạy tests (85 test cases)
npx tsc --noEmit      # Type check
npm start             # Expo dev server
npm run lint          # ESLint check
```

## Cấu trúc dự án

```
src/
├── services/         # Business logic — gọi Supabase + fallback SQLite local
│   └── auth.helper.ts  # Shared getAuthUserId() với 30s cache + offline cache fallback
├── repositories/     # Read-only repos đọc SQLite local mirror (12 entities)
├── sync/             # Sync engine + push/pull worker + conflict bus + image upload defer
├── stores/           # Zustand stores — gọi services, quản lý state
├── utils/            # Hàm thuần — balance, settlement, split, validate
├── types/            # database.types.ts — TypeScript mirrors SQLite + Supabase schema
├── config/           # constants, supabase client, theme, fonts
├── hooks/            # useAppTheme, useQueueStats (pending + conflict count)
├── db/               # SQLite schema v3, database init, migrations
├── components/
│   ├── common/       # ErrorBoundary, CreateJoinSheet, OfflineBanner, PresetFormModal
│   ├── sync/         # ConflictResolverModal — listen conflictBus
│   ├── trip/         # ExpensesTab, BalancesTab, SettlementTab, HistoryTab
│   └── ui/           # AppCard, AppText, AppTextField, Money, ChipPicker, etc.
├── app/
│   ├── (auth)/       # login.tsx, register.tsx, forgot-password.tsx, reset-password.tsx
│   └── (main)/       # index.tsx, settings.tsx, presets.tsx, groups/[id].tsx,
│                     # trips/[id].tsx, sync-conflicts.tsx (Conflict Inbox)
└── __tests__/        # balance.test.ts, settlement.test.ts, split.test.ts
```

## Offline-first architecture

### Mô hình storage: Write-through queue
Server (Supabase) là source of truth. SQLite local là mirror cho read offline +
queue cho write offline. Khi online: write trực tiếp lên server, fallback queue
khi network fail. Khi offline: write SQLite + enqueue ngay.

### Pipeline sync
```
UI → Service (online check) ─┬─→ Server (RPC/INSERT) ─→ Success
                              └─→ enqueue + write SQLite (offline path)
                                          ↓
                                    SyncEngine.run()
                                          ↓
                                   PullAll → PushQueue → PullAll
                                                ↓
                              ConflictBus.emit → ConflictResolverModal
```

### 9 sync pattern cho 21 mutation
- **P1 Append-only create**: client UUID + `client_request_id` UNIQUE — UPSERT safe replay.
  `createExpense`, `createPayment`, `createTrip`, `createPreset`, `addVirtualMember`.
- **P2 Soft-delete idempotent**: `SET deleted_at = COALESCE(deleted_at, now())`.
  `deleteExpense`, `deletePayment`, `deleteGroup`, `removeMember`, `deletePreset`,
  `clearTrip`, `deleteTrip`.
- **P3 Optimistic concurrency (version)**: client gửi `base_version`, server check,
  mismatch → RPC raise `P0410` → conflict modal. `updateGroup`, `updateTripName`,
  `renameMember`, `updateDisplayName`, `updatePreset`.
- **P4 State machine**: `close_trip`/`reopen_trip` — idempotent server-side (no-op nếu đã
  ở trạng thái target).
- **P5 LWW theo `updated_at`**: `updateSettings` — server check `current.updated_at >
  base_updated_at` → conflict modal.
- **P7 Idempotent set**: `pinTrip`, `unpinTrip`, `reorderPinnedTrips`, `markAsRead`,
  `markAllAsRead`, `deleteNotification`.

**Pending-check chống cross-op race**: Mọi op P2/P3/P4/P5/P7 phải gọi
`syncQueue.hasPendingForEntity(entityType, entityId)` trước Flow A direct-server-call. Nếu có
pending → enqueue thay vì gọi direct, để FIFO queue replay đảm bảo causal order. Pattern
reference: [closeTrip](src/services/trip.service.ts) (P4) hoặc [deleteExpense](src/services/expense.service.ts) (P2). Loại trừ:
- **P1 creates** skip vì entity_id là UUID mới mint trong cùng call (không thể có pending).
- **Notification ops** (`markAsRead`/`markAllAsRead`/`deleteNotification`) skip vì entity_id
  composite (`"id1|id2|..."` hoặc `"all"`) — single-id check không match. Race rất hiếm và
  server ops idempotent.
- **reorderPinnedTrips** dùng composite `"tripA|tripB"` → chỉ catch reorder-vs-reorder cùng
  order; reorder-vs-pin/unpin riêng lẻ KHÔNG catch (rare, LWW server xử lý gần đủ).

Mọi op mới thêm vào dispatcher PHẢI tuân pattern này nếu không phải P1 create thuần.

### Phân lớp file
- **Repositories** (`src/repositories/`): 12 file đọc SQLite local. Mỗi entity có
  `getById()`, `listByX()`, `upsertFromServer()` (sync engine pull gọi).
- **Sync engine** (`src/sync/`):
  - `syncEngine.ts` — orchestrator. Triggers: bootstrap, online transition, foreground.
  - `pullWorker.ts` — delta pull per-table theo watermark `updated_at`.
  - `pushWorker.ts` + `pushDispatcher.ts` — replay queue, map op_type → RPC.
  - `syncQueue.ts` — CRUD `sync_queue` table (status, retry, conflict).
  - `syncState.ts` — watermark per-table cho delta pull.
  - `conflictBus.ts` — emit P0410 events to ConflictResolverModal.
  - `resolveConflict.ts` — keepMine/keepTheirs/defer actions.
  - `authCache.ts` — `_auth_cache` table cho offline bootstrap.
  - `imageStaging.ts` + `imageUploadWorker.ts` — defer image upload R2.
  - `fallback.ts` — `tryServerThenLocal` cho read fallback.
  - `writeFallback.ts` — `tryServerOrQueue` + `isNetworkError` helper.
  - `SyncBridge.tsx` — wire run() vào session/online/AppState triggers.

### Migrations SQL (foundation)
3 migrations + 1 security hardening đã apply lên Supabase main:
- `20260521100000_offline_first_version_columns.sql` — thêm `version` + `updated_at` +
  `client_request_id` + trigger `bump_version_and_updated_at()` cho 11 bảng mutable.
- `20260521100100_expense_presets_soft_delete.sql` — preset soft-delete + partial unique
  index thêm `AND deleted_at IS NULL`.
- `20260521100200_optimistic_concurrency_rpcs.sql` — 9 RPC mới với optimistic concurrency:
  `update_group`, `update_trip_name`, `update_member_display_name`,
  `update_user_display_name`, `update_preset`, `close_trip`, `reopen_trip`,
  `update_user_settings`, `delete_payment`.
- `20260521xxxxxx_offline_first_security_hardening` — `SET search_path` cho 2 trigger
  funcs + `REVOKE EXECUTE ... FROM anon` cho 9 RPC mới.

### Conflict resolution UI
- Modal hiện khi sync engine catch `P0410` → emit `ConflictEvent` → mount-time listener
  hiện modal. 3 action:
  - **Giữ của tôi** — resubmit queue với `base_version = server.version` (force overwrite).
  - **Giữ của họ** — discard queue + UPDATE local mirror với server data.
  - **Xem sau** — đóng modal, item ở `/sync-conflicts` (Conflict Inbox).
- Route `(main)/sync-conflicts.tsx` list mọi queue item `status='conflict'`. Entry
  điểm trong Settings hiện badge count nếu > 0.

### Login offline
- Identity cache trong `_auth_cache` SQLite row (single row, id=1).
- `useAuthStore.initialize()` load cached identity TRƯỚC khi Supabase getSession() →
  AuthGate accept `session || cachedIdentity` → user vào /(main) khi offline first-boot.
- `getAuthUserId()` fall back vào `_auth_cache` khi `supabase.auth.getUser()` fail
  hoặc trả null.
- Sign-in success → `persistIdentityToCache()` fire-and-forget. Sign-out → `authCache.clear()`.

### Image defer upload
- ExpenseFormScreen: online → upload R2 ngay; offline → `stageExpenseImage()` copy
  ảnh compressed vào `documentDirectory/pending_images/<expense_id>.jpg` + register
  `pending_image_uploads` row.
- `imageUploadWorker.uploadPending()` chạy sau `pushPending` trong `syncEngine.run()`:
  - Check expense đã có trên server qua client_request_id (skip nếu pending).
  - presign + `FileSystem.uploadAsync` PUT lên R2 + commit Edge Function.
  - UPDATE `expenses.image_url` với R2 URL + cleanup local file + remove pending row.
- Local fail (file missing/expense deleted) → mark dead, dọn row.
- Worker dùng `expo-file-system/legacy` cho `documentDirectory` + `uploadAsync` API
  (SDK 55 new `File` class chưa cover upload).

### Sync triggers
SyncBridge (mounted ở `_layout`) wire `syncEngine.run()` vào 3 sự kiện:
1. Session active (sau initialize)
2. NetInfo transition offline → online
3. AppState background → active

Rate-limited: 5s minimum giữa 2 run, single-flight (1 run-at-a-time).

### Quan trọng khi viết code mới
- **Read offline**: services có fallback qua `tryServerThenLocal(serverFn, localFn)`.
  Khi thêm fetch mới, viết kèm local query (SQLite shape khớp service type vì cùng
  snake_case).
- **Write offline**: pattern trong `createExpense` / `updateGroup`:
  1. Lookup local entity để check authz + lấy `base_version` (nếu P3)
  2. Define `enqueueLocal()` — write SQLite + `syncQueue.enqueue()`
  3. Nếu không phải P1 create thuần: `const hasPending = await syncQueue.hasPendingForEntity(entityType, entityId)` →
     `if (!isOnline || hasPending) { await enqueueLocal(); if (isOnline) void runSync().catch(() => {}); return; }`
  4. try server RPC; catch `isNetworkError(err)` → fall back to `enqueueLocal`
  5. Với op có local write-back cần mirror server state (vd pinned_trips): tách
     `writeLocal()` riêng, gọi cả trong `enqueueLocal()` lẫn ngay sau Flow A success.
  6. **Write-back checklist sau RPC P3/P5/direct UPDATE success**: trigger
     `bump_version_and_updated_at` (và analog `bump_version_users`) tự bump
     `version + updated_at` mỗi UPDATE. Client PHẢI mirror đầy đủ về local SQLite,
     nếu không lần update kế gửi base stale → P0410 (`version_conflict` hoặc
     `lww_stale`). Dùng helper `mirrorServerRow(table, id, serverRow, extraCols)`
     từ [src/repositories/writeback.ts](src/repositories/writeback.ts) — đối chiếu
     `RETURNS TABLE(...)` SQL với call site, mọi cột RPC trả về phải có trong
     write-back. Reference: 12+ call sites đã apply pattern. Direct
     `.from('X').update({...})` (không qua RPC) phải thêm `.select('version,
     updated_at').single()` để capture trigger bump. Bài học: [memory
     `feedback_rpc_writeback_all_bumped_cols`](C:/Users/ADMIN/.claude/projects/d--fair-pay/memory/feedback_rpc_writeback_all_bumped_cols.md).
- **Mỗi op_type mới**: phải thêm handler trong `pushDispatcher.ts` (case switch theo
  `OP_TYPES`).
- **Trigger sync**: KHÔNG gọi `syncEngine.run()` thủ công từ UI — SyncBridge tự handle.
- **Cảnh báo về dispatcher import circular**: tránh import từ `services/*` trong
  `pushDispatcher.ts` ở module-load time. Dùng `await import()` lazy (vd
  `getAuthUserId` chỗ CREATE_TRIP, DELETE_NOTIFICATION).

## Quy tắc quan trọng

### Auth helper
- **KHÔNG tạo `getAuthUserId()` cục bộ** trong service files. Luôn import từ `src/services/auth.helper.ts`.
- Hàm này có 30s cache — gọi `clearAuthCache()` khi user logout (đã tích hợp trong `auth.store.ts`).

### Password reset flow
- 3 bước: `sendPasswordResetEmail(email)` → Supabase gửi email với link `fairpay://reset-password` → user click → app parse URL fragment (hoặc `?code=` cho PKCE) → `setSession` → `updatePassword(newPassword)` → `router.replace('/(main)')`.
- `AuthGate` ở `src/app/_layout.tsx` có exception cho `segments[1] === 'reset-password'` — session active ở route này KHÔNG bị redirect sang `(main)`. Đừng bỏ exception đó.
- `supabase.auth.resetPasswordForEmail` KHÔNG trả lỗi khi email không tồn tại (chống enumeration). Đừng build UI phân biệt case đó.
- Cooldown 60s lưu trong `expo-secure-store` qua `getResetCooldownRemaining()` + `markResetSent()` — đừng bypass trong UI vì quota email Supabase giới hạn ~4 email/h.
- SecureStore keys chỉ được chứa alphanumeric + `.`, `-`, `_` (KHÔNG `:`). Key hiện tại: `fair_pay_reset_last_sent`.
- Prerequisite deploy: whitelist `fairpay://reset-password` trong Supabase Dashboard → Auth → URL Configuration → Redirect URLs.

### Authorization
- Chỉ có 2 role: `'admin' | 'member'`. Mỗi nhóm có **đúng 1 admin** (người tạo nhóm). Admin không tự rời/bị xóa; chỉ member mới rời/bị xóa được.
- Mọi hàm service thay đổi dữ liệu nhóm PHẢI gọi `assertRole()` ở đầu hàm (đã có trong `group.service.ts`).
- `assertRole(groupId, ['admin'])` — check caller có role trong danh sách cho phép.
- `removeMember` phải chặn xóa admin (`target.role === 'admin'`).
- `updateMemberRole` hiện `@deprecated` — giữ signature cho tương lai (Transfer Admin atomic). Không gọi từ UI.

### Thành viên ảo (virtual member)
- Ghost/virtual member = `group_members` với `user_id = NULL` và `is_virtual = true`. UUID `group_members.id` vẫn tự sinh như thành viên thường.
- Chỉ admin tạo được qua `addVirtualMember(groupId, displayName)` trong `group.service.ts`.
- **CHO PHÉP trùng `display_name`** — phân biệt bằng `VirtualPill` badge trong UI, KHÔNG check duplicate ở service.
- Ảo được là `paid_by`, `from_member_id`, `to_member_id` như member thường — balance/settlement không phân biệt.
- Ảo KHÔNG có auth session → không tự gọi API. Mọi action do admin thực hiện, audit log `actor_id` là admin.
- Type `is_virtual`: Postgres trả `boolean`, SQLite raw là `0|1`. Code hiện dùng truthy check (`item.is_virtual ? ... : ...`) — hoạt động với cả 2. Tránh so sánh `=== true` hoặc `=== 1`.

### Supabase queries
- Mọi query liên quan `group_members` PHẢI có `.is('left_at', null)` trừ khi cần hiển thị lịch sử.
- Ưu tiên `Promise.all()` cho queries độc lập — tránh chạy tuần tự không cần thiết.
- Khi loop filter data theo trip/group, dùng `Map` pre-index thay vì `.filter()` trong vòng lặp.

### RPC atomic (multi-step writes)
- Các mutation nhiều bước (insert + splits + audit + notify) PHẢI gọi RPC để đảm bảo atomic — KHÔNG ghép bằng Promise.all client-side. Hiện có 7 RPC:
  - `clear_trip`, `delete_trip` — trip lifecycle ([trip.service.ts](src/services/trip.service.ts))
  - `create_expense` — atomic insert expense + splits + audit + notify ([expense.service.ts](src/services/expense.service.ts))
  - `approve_join_request` — atomic insert/rejoin member + status + audit + notify ([group.service.ts](src/services/group.service.ts))
  - `create_notifications_batch` — atomic batch fan-out + dedup window 10 phút ([notification.service.ts](src/services/notification.service.ts))
  - `cleanup_notifications` — daily cron 03:00 ICT (pg_cron scheduled, không gọi từ TS)
- Pattern RPC: `SECURITY DEFINER + SET search_path = public, pg_temp` + explicit `is_admin()/is_member()` check + REVOKE PUBLIC + GRANT authenticated + `COMMENT ON FUNCTION` liệt kê error codes. Tham khảo [supabase/migrations/20260511134015_trip_clear_and_delete_rpc.sql](supabase/migrations/20260511134015_trip_clear_and_delete_rpc.sql).
- Actor luôn = `auth_user_id()` ở SQL — KHÔNG nhận `p_actor_id` từ client để chống spoofing.
- Map Postgres error codes → tiếng Việt ở [src/utils/error.ts](src/utils/error.ts). Khi thêm errcode mới ở SQL, NHỚ thêm vào ERROR_MAP.
- Internal SQL helpers (`_get_group_recipients`, `_format_dedup_title`, `_create_notifications_dedup`, `_log_action`) chỉ gọi từ RPC khác — KHÔNG GRANT authenticated.
- `_format_dedup_title` SQL ↔ `formatNotificationTitle` TS ([src/utils/notificationFormat.ts](src/utils/notificationFormat.ts)) phải đồng bộ logic plural khi sửa.
- Dedup window literal `interval '10 minutes'` trong `_create_notifications_dedup` SQL phải đồng bộ với `NOTIF_DEDUP_WINDOW_MS` ở [src/config/constants.ts](src/config/constants.ts).

### TypeScript
- **KHÔNG dùng `: any`** trong service layer. Dùng `as Type` cast hoặc define interface cho Supabase returns.
- Khi thêm prop mới cho component, LUÔN kiểm tra và cập nhật interface/props type TRƯỚC khi dùng trong JSX.
- `Appearance.getColorScheme()` trả về `'light' | 'dark' | null` — KHÔNG dùng trực tiếp làm object key. Dùng ternary: `scheme === 'dark' ? X : Y`.

### Tiền VND
- Tất cả amount là INTEGER (đơn vị VND), bội của 1.000đ.
- Hàm split luôn dùng pattern "người cuối nhận remainder" — remainder PHẢI được clamp `Math.max(0, remaining)`.
- `validateAmount()` và `validateSplits()` nằm trong `src/utils/split.ts` — gọi trước khi tạo expense.
- Input validation cơ bản (tên, số tiền) nằm trong `src/utils/validate.ts` — gọi ở đầu service create functions.

### Quy ước dấu cho balance (UI)
- **`-` (minus)** = user ĐANG NỢ — `balance < 0`, "cần trả", tone `danger` (đỏ).
- **`+` (plus)** = user ĐƯỢC NỢ — `balance > 0`, "được nhận", tone `success` (xanh).
- **`0` (settled)** → KHÔNG hiển thị badge/sign. Tuỳ component có thể hiện chữ "cân bằng" hoặc ẩn hẳn.
- Lý do: dấu phản ánh **góc nhìn của user**, không phải kế toán. User nợ → số âm. Được nợ → số dương. Đảo lại sẽ gây hiểu nhầm.
- Triển khai: `<Money value={balance} showSign />` — pass **RAW signed balance** (KHÔNG `Math.abs`). `Money.tsx` xử lý dấu đúng convention: `value >= 0 ? '+' : '-'`. Pass abs với `showSign` sẽ luôn ra `+` → SAI (bug đã từng có ở [GroupArcCard.tsx](src/components/home/GroupArcCard.tsx), [GroupRow.tsx](src/components/home/GroupRow.tsx)).

### Component organization
- Screens lớn (>300 dòng) PHẢI tách thành sub-components theo tab/section.
- Sub-components dùng `React.memo()`. Nguồn data linh hoạt: props, store (Zustand), context — chọn cái hợp lý nhất theo từng case (data đã có sẵn ở parent → props; cross-tree shared state → store/context). Không có quy tắc cứng.
- `useAppTheme()` trả về `{ isDark, ...colors }` — KHÔNG import `useIsDark()` riêng (deprecated).

### Tap-ngoài dismiss keyboard
- Mọi screen/sheet chứa `TextInput`/`AppTextField`/`MoneyTextField`/`BottomSheetTextInput` PHẢI wrap content bằng `<DismissKeyboardView>` (từ `src/components/ui/DismissKeyboardView.tsx`) để tap empty area → keyboard dismiss. Component là Pressable không có visual feedback (disable ripple/sound) + `accessible={false}` — nested Pressable children (Button/ChipPicker/Link/Input) vẫn nhận tap đúng nhờ RN responder composition.
- Trong `KeyboardAwareScrollView`/`ScrollView` có input, thêm `keyboardDismissMode="on-drag"` + `keyboardShouldPersistTaps="handled"`. Wrap children với `DismissKeyboardView` để tap empty area cũng dismiss.
- Trong BottomSheet có input: wrap content **bên trong** `BottomSheetView`/`BottomSheetScrollView` (KHÔNG thay thế) — giữ nguyên `keyboardBlurBehavior="restore"` cho tap-overlay flow. Pressable wrap không xung đột với gorhom drag-to-close gesture.
- `MoneyChipsDock` render là **sibling** (ngoài scroll) — không nằm trong wrap → tap chip vẫn fill amount, keyboard giữ mở.
- Reference: 4 auth screens, ExpenseFormScreen, PresetFormScreen, SettlementTab, 7 BottomSheet input sheets.

### TextInput trong BottomSheet (gorhom / heroui-native)
- IME tiếng Việt (telex/VNI) **bị loạn dấu/nhân ký tự** khi gõ trong `BottomSheetTextInput` controlled. Mọi re-render trong lúc compose dấu sẽ reset IME state. Lỗi gốc ở RN (issue #19339 đã lock không có resolution); gorhom #902/#1494 là cùng triệu chứng. Input ngoài bottom sheet KHÔNG bị.
- Pattern fix bắt buộc: input **uncontrolled** — `defaultValue=""` + `onChangeText` ghi vào `useRef` (không trigger render). Track riêng `hasContent` boundary boolean để bật/tắt nút submit (chỉ flip khi rỗng↔không rỗng, không re-render mỗi keystroke). Đọc giá trị từ ref ở `handleSubmit`.
- Reset input khi mở lại sheet: đổi `key={resetKey}` để remount. KHÔNG dùng `inputRef.current.clear()` — `BottomSheetTextInput` dùng GH `TextInput` branded type, không match `RefObject<RnTextInput>`.
- **KHÔNG dùng `autoFocus`** trên `BottomSheetTextInput`. Bug gốc: input luôn render → autoFocus chạy khi screen mount → (1) keyboard tự mở dù sheet còn đóng, (2) sheet không extend (gorhom keyboard listener chưa kịp gắn). UX-wise cũng bad cho EDIT sheet: input rỗng → autoFocus → keyboard mở → value mới fill (vì giá trị từ prop chưa kịp inject vào defaultValue khi input mount). User phải tap input để mở keyboard — chấp nhận thêm 1 tap đổi lấy code đơn giản + UX nhất quán.
- Hệ quả: KHÔNG cần pattern `showInput` (trì hoãn render input sau khi sheet animate xong qua `onChange` của `BottomSheet.Content`) nữa. Pattern đó từng được tạo CHỈ để né bug autoFocus. Bỏ autoFocus → render input trực tiếp + `defaultValue={initialValue}` + `key={resetKey}` đủ rồi.
- Snap points + keyboard: `enableDynamicSizing={false}` + `snapPoints={['X%', 'Y%']}` + `keyboardBehavior="extend"` + `keyboardBlurBehavior="restore"` + `android_keyboardInputMode="adjustResize"`. Dynamic sizing không có "đỉnh" để extend → keyboard sẽ che input.
- Reference implementation: `src/components/common/AddVirtualMemberSheet.tsx`.
- **ĐỪNG thử workaround sau** (đã verify KHÔNG WORK): thay `BottomSheetTextInput` bằng plain `TextInput` (kết hợp `react-native-keyboard-controller` ở root) → vẫn loạn dấu (bug nằm ở `BottomSheet.useAnimatedKeyboard` re-renders, không chỉ riêng `BottomSheetTextInput`) **và** sheet không extend (gorhom không detect plain TextInput). Giữ pattern uncontrolled-ref.

### Chip gợi ý tiền dock keyboard
- Pattern: chip render là sibling của `BottomSheet.Content` trong `<BottomSheet.Portal>`, dùng `<KeyboardStickyView offset={{ closed: 0, opened: 0 }}>` từ `react-native-keyboard-controller`. Component này tự dock chip ở mép trên keyboard, animation worklet đồng bộ frame-by-frame, đã handle cross-OEM (Xiaomi MIUI, Oppo, Samsung) — không cần tự tính `kbHeight + insets.bottom`.
- Track focus của input tiền qua `onFocus`/`onBlur` → render chip có điều kiện `isOpen && amountFocused` để không hiện khi user focus input khác.
- `KeyboardProvider` đã wrap ở root layout (`src/app/_layout.tsx`) — bắt buộc trước khi dùng bất kỳ API nào của keyboard-controller.
- Logic suggestions ở `computeMoneySuggestions()` trong `src/utils/format.ts` — gõ rỗng → defaults `[50k, 100k, 200k, 500k]`; single-digit start ×10.000 (gõ "3" → `[30k, 300k, 3tr, 30tr]`); multi-digit start ×1.000 (gõ "35" → `[35k, 350k, 3.5tr, 35tr]`, gõ "150" → `[150k, 1.5tr, 15tr, 150tr]`). Cap ở 999 tỷ.
- Reference implementation: `src/components/common/PresetFormModal.tsx`.

### User profile
- Màn Cài đặt là route `(main)/settings.tsx` — mở bằng `router.push('/settings')` (stack animation `slide_from_right`), KHÔNG còn là BottomSheet.
- `display_name` giới hạn `DISPLAY_NAME_MAX_LENGTH = 30` ký tự (ở `src/config/constants.ts`) — enforce ở service `updateDisplayName()` và input `maxLength` trong UI. Đổi giá trị thì phải đồng bộ cả hai chỗ.
- Text dài (display_name, email) trong card profile PHẢI có `numberOfLines={1}` + `ellipsizeMode="tail"` và cha có `minWidth: 0` để flex shrink đúng.

### Audit logging
- `logAction()` dùng `getAuthUserId()` (app user ID) — KHÔNG dùng `supabase.auth.getUser().id` (auth UUID).
- Audit failures được bọc try/catch im lặng — KHÔNG throw ra ngoài.
- `before_data` và `after_data` có type `Record<string, unknown> | null`.

### Notifications
- Mọi service mutation tạo/sửa/xóa dữ liệu nhóm PHẢI gọi `notifyXxxEvent()` từ `src/services/notification.service.ts` song song với `logAction()` (Promise.all). Wrap try/catch im lặng — KHÔNG block main flow nếu fail (cùng pattern `logAction`).
- Bảng `notifications` per-user fan-out (mỗi recipient 1 row) — KHÔNG dùng per-event với join. RLS: SELECT/UPDATE/DELETE chỉ chính chủ; INSERT cho phép `auth.uid() IS NOT NULL` (services tự validate).
- Title VN render ở write-time qua `formatNotificationTitle()` trong `src/utils/notificationFormat.ts` (pure, có unit test). KHÔNG i18n runtime, dùng `formatVND()` cho tiền.
- 11 notification types: `expense.created/edited/deleted`, `payment.recorded/received`, `member.join_requested/approved/rejected`, `member.role_change`, `trip.closed`, `trip.reminder_settle` (Phase 3 cron). Mapping `type → setting key` ở `getSettingKeyForType()`.
- Hằng số trong `src/config/constants.ts`: `NOTIF_PAGE_SIZE = 30`, `NOTIF_DEDUP_WINDOW_MS = 10*60*1000`, `SETTLE_SUGGEST_MIN_AMOUNT = 200_000`, `SETTLE_SUGGEST_AGE_DAYS = 3`, `SETTLE_SUGGEST_COOLDOWN_DAYS = 7`. Sửa cần đồng bộ với docs.
- Recipient resolver (`getGroupRecipients()`) loại trừ: actor, member ảo (`is_virtual=true` hoặc `user_id IS NULL`), member rời (`left_at IS NOT NULL`), user tắt setting tương ứng (`notify_activity/payment/member/smart`). Mỗi mutation tự nhặt setting key qua `getSettingKeyForType()`.
- TTL 30/60 ngày — KHÔNG nâng vì giới hạn Supabase free tier 500MB. Cron `cleanup_notifications()` chạy daily 03:00 ICT (đã schedule qua `pg_cron`).
- Dedup 10 phút trong `createNotifications()`: khớp `(user, group, type, actor)` chưa đọc → UPDATE row đó (push `data.target_ids`, tăng `data.count`, refresh `created_at`) + đổi title sang "{Actor} đã thêm N khoản chi" — KHÔNG insert mới.
- `UserSettings` shape (`src/services/user.service.ts`): `dark_mode | notify_activity | notify_payment | notify_member | notify_smart | haptics_enabled | animations_enabled`. KHÔNG còn legacy `notify_expense`/`notify_reminder`.
- Bell + badge ở `headerRight` của route `index` (home) — `useFocusEffect` ở home → `refreshUnreadCount()` mỗi lần focus (polling on focus, KHÔNG setInterval).
- Tham chiếu chi tiết: `docs/technical-specification.md` §3.10 + §6, `docs/business-requirements.md` §11.5 + §8 (BR-NOTIF-01..07).

### Preset khoản chi
- Per-user, scope qua `getAuthUserId()`. Bảng `expense_presets` có RLS đầy đủ 4 policies SELECT/INSERT/UPDATE/DELETE (`user_id = auth_user_id()`).
- 2 scope:
  - **Global** (`trip_id IS NULL`): lưu `{title, amount, category}`. Template tái dùng cross-group.
  - **Trip-pinned** (`trip_id` NOT NULL): lưu thêm OPTIONAL `paid_by_member_id`, `split_type`, `splits_data`. CASCADE xóa khi xóa trip. Group implicit qua `trips.group_id`.
- `splits_data` jsonb lưu **rule** (member list + ratio/amount), KHÔNG lưu final amounts → đổi `amount` preset không phá splits:
  - `split_type='equal'` → `[{member_id}]`
  - `split_type='ratio'` → `[{member_id, ratio}]`
  - `split_type='custom'` → `[{member_id, amount}]`
- Constraints DB: `preset_scope_consistency` (paid_by/splits chỉ valid khi trip_id set), `preset_splits_pair` (split_type ↔ splits_data đi cùng).
- "Full" preset = trip-pinned có đủ `paid_by + splits` → enable 1-tap submit từ dock qua confirm dialog. Check qua `isFullPreset()`.
- Apply preset vào trip qua `applyPresetToTrip()` ở [preset.service.ts](src/services/preset.service.ts): validate paid_by + splits members còn `left_at IS NULL`, fallback graceful (current user / chia đều all active) + warnings inline.
- 2 partial unique indexes thay vì `UNIQUE(user_id, title)`: `(user_id, title) WHERE trip_id IS NULL` cho global, `(user_id, title, trip_id) WHERE trip_id IS NOT NULL` cho trip-pinned. Service catch `23505` → throw "Đã có preset trùng tên trong phạm vi này".
- Hard delete (không có `deleted_at`). Xóa có confirm qua `BouncyDialog`.
- `paid_by_member_id` ON DELETE SET NULL (member rời không phải xóa hard); validate runtime + fallback ở apply-time.
- Reuse `validateAmount` (từ `src/utils/split.ts`, bội 1.000đ) + `validateName` (từ `src/utils/validate.ts`) + `splitEqual`/`splitByRatio` để resolve final amounts khi apply.
- Sort theo `updated_at DESC`. Cột `updated_at` tự động refresh qua trigger `set_updated_at`.
- **Edit preset KHÔNG cascade** vào expense đã dùng — preset chỉ là template, expense đã có bản sao dữ liệu riêng.
- KHÔNG log audit (personal data, không liên quan group).
- `EXPENSE_CATEGORIES` ở `src/config/constants.ts` là single source of truth — KHÔNG hardcode lại trong component.

### Preset UI flow
- Màn quản lý riêng: route `(tabs)/presets.tsx` — list + CRUD đầy đủ. List item hiện badge `📍 {tripName}` cho trip-pinned + badge `⚡ 1-tap` cho full preset.
- Form thêm/sửa dùng chung `PresetFormModal` (BottomSheet) với scope picker: Global / Gắn chuyến đi. Khi pick trip → optional paid_by ChipPicker + optional split section (equal/ratio/custom với member checkboxes).
- Selector `getPresetsForContext({ tripId })` ở [preset.store.ts](src/stores/preset.store.ts):
  - **Home** (`tripId=null`): all presets (global + all trip-pinned). Sort trip-pinned > global.
  - **In-trip** (`tripId=X`): **chỉ** global + trip-pinned-của-X. KHÔNG hiện trip-pinned của trip khác (tránh nhiễu).
- Entry **dock "+"** mở `QuickAddActionSheet`:
  - Chip row preset (hoặc empty state hint "Tạo preset" → /presets).
  - Tap **global** → navigate `/expenses/new?prefill...` (form pre-fill, user chọn trip).
  - Tap **trip-pinned partial** → navigate `/trips/{tripId}/expenses/new?applyPresetId=...&prefill...` (form pre-fill trip + có sẵn).
  - Tap **trip-pinned full** → `BouncyDialog` confirm → tap "Tạo" → `applyPresetToTrip` → `createExpense` RPC trực tiếp, KHÔNG mở form. Warning được hiển thị qua toast variant `warning` nếu có fallback.
  - 3 button "Chụp ảnh / Chọn thư viện / Nhập thủ công" giữ nguyên ở dưới.
- Entry **in-trip "+"** (ExpensesTab): đi thẳng `/trips/{tripId}/expenses/new` → form. Trong form có chip row preset filter strict theo `currentTripId` (chỉ global + trip-pinned của trip này). Tap chip → apply full data ngay vào state (fallback graceful nếu member thay đổi).
- **Form Thêm khoản chi** đã merge 2-step (`basic` + `Cách chia`) thành 1 màn scroll — bỏ button "Tiếp tục", có 1 submit "Thêm khoản chi" duy nhất ở cuối.
- Switch "Lưu làm preset" trong form → tạo **global** preset (không trip). Pre-check trùng title chỉ check global scope (`presetConflict` true → disable submit + hint inline).
- `applyPresetId` URL param: form effect mount → lookup preset trong store → nếu trip match + full data → apply paid_by + splits qua `applyPresetFullData` helper. Stale member → fallback default + warning banner trên form.
- **AppDock chỉ visible ở (tabs) main pages** — không cần truyền `currentTripId` xuống QuickAddActionSheet.

### Android build & signing (bare workflow)
- Repo này commit thư mục `android/` (KHÔNG ignore) → build local bằng `cd android && ./gradlew bundleRelease`, **KHÔNG** rely vào `expo prebuild` để generate config mỗi lần. `app.json` thay đổi `versionCode`/`android.*` KHÔNG có tác dụng cho đến khi prebuild chạy lại.
- Bump version cho Play Console upload: sửa **trực tiếp** `versionCode` ở [android/app/build.gradle:95](android/app/build.gradle#L95) (mỗi build Play Console yêu cầu `versionCode` mới; `versionName` được phép trùng).
- **Signing config: 1 keystore master dùng chung cho cả `debug` + `release`** ở [android/app/build.gradle:100-131](android/app/build.gradle#L100-L131):
  ```gradle
  signingConfigs {
      fairpay {
          if (project.hasProperty('FAIRPAY_KEYSTORE_PATH')) {
              storeFile file(FAIRPAY_KEYSTORE_PATH)
              storePassword FAIRPAY_KEYSTORE_PASSWORD
              keyAlias FAIRPAY_KEY_ALIAS
              keyPassword FAIRPAY_KEY_PASSWORD
          } else {
              throw new GradleException(
                  'Thiếu FAIRPAY_KEYSTORE_PATH trong ~/.gradle/gradle.properties. ' +
                  'Xem hướng dẫn setup keystore trong CLAUDE.md.'
              )
          }
      }
  }
  buildTypes {
      debug   { signingConfig signingConfigs.fairpay }
      release { signingConfig signingConfigs.fairpay; ... }
  }
  ```
- 4 property đọc từ `~/.gradle/gradle.properties` (global, ngoài repo, KHÔNG commit): `FAIRPAY_KEYSTORE_PATH`, `FAIRPAY_KEYSTORE_PASSWORD`, `FAIRPAY_KEY_ALIAS`, `FAIRPAY_KEY_PASSWORD`.
- Lý do dùng chung keystore cho debug: SHA-1 fingerprint duy nhất → Google Sign-In OAuth client chỉ cần whitelist 1 SHA-1 cho mọi build local. KHÔNG dùng `~/.android/debug.keystore` mặc định.
- **Nếu chạy `expo prebuild` (đặc biệt `--clean`)**: cấu hình `signingConfigs.fairpay` + `buildTypes.debug.signingConfig` sẽ bị **OVERWRITE** về template Expo mặc định (`debug` xài `debug.keystore`, `release` không có signing). Phải restore lại block trên + giữ `versionCode` mới nhất. Bug đã từng xảy ra → xem [project_android_signing.md](C:/Users/ADMIN/.claude/projects/d--fair-pay/memory/project_android_signing.md).
- **`expo prebuild --clean` bị `EBUSY: resource busy or locked, rmdir 'android'` trên Windows khi VS Code đang mở project**: VS Code file watcher giữ directory handle vào `android/` (kể cả sau khi Expo đã xóa được contents bên trong) → `rmdir` folder gốc fail. Tệ hơn: lệnh `expo prebuild` cũng zombie không exit hẳn, giữ thêm lock chồng lên — retry lần 2 còn fail nặng hơn. Cách xử lý theo thứ tự ưu tiên:
  1. **Skip `--clean`**: nếu `android/` đã rỗng hoặc gần rỗng (lần fail trước Expo đã kịp xóa contents), chạy `npx expo prebuild --platform android` (merge mode) — Expo generate vào folder hiện tại, không cần xóa folder gốc.
  2. **Collapse folder `android` trong VS Code Explorer sidebar** (click mũi tên ▼) → file watcher release directory handle → retry `--clean`.
  3. **Đóng hẳn VS Code** → mở PowerShell standalone từ Start Menu → `cd C:\Users\tranh\fair-pay` → chạy `--clean` → mở lại VS Code.
  4. Trước khi retry: kill zombie process lần fail trước bằng `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'expo prebuild' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }` + `adb kill-server` (adb daemon hay khóa folder phụ).

### Firebase services (Android-only)
- 2 SDK đang dùng trong [android/app/build.gradle](android/app/build.gradle) Firebase BoM block: `firebase-messaging` (FCM push) + `firebase-analytics` (DAU/MAU/country/version, auto-collected events only — KHÔNG có JS code). Cùng share `google-services.json` + BoM 34.13.0.
- **Firebase Analytics**: chỉ native SDK, không có wrapper RN. Auto-collected events ra-of-the-box (`first_open`, `session_start`, `user_engagement`, `app_remove`, country/device/version dimensions). KHÔNG log custom event nào — business event đã có ở `audit_logs` table riêng.
- **AD_ID permission đã chặn**: Analytics SDK ≥21.0.0 tự inject `com.google.android.gms.permission.AD_ID` qua manifest merger. Block ở 2 chỗ — `app.json` `expo.android.blockedPermissions` (survive prebuild) + `AndroidManifest.xml` hand-edit (`tools:node="remove"`). Hậu quả: mất age/gender demographics + audiences, NHƯNG giữ được DAU/country/version/device + Play Console Data Safety form gọn (không khai báo advertising ID).
- Verify Analytics SDK fire event: smoke test trên máy dev qua `adb shell setprop debug.firebase.analytics.app com.throneware.fairpay` → Firebase Console DebugView. Tester thật KHÔNG cần adb — events tự về Dashboard sau 24-48h batch.
- Stack FCM: `expo-notifications` (SDK 55 dùng FCM v1 native) + cột `users.fcm_token` (1 user / 1 token) + Edge Function `send-push` + Postgres trigger qua `pg_net`.
- Token registration: gọi `registerForPushNotifications()` (fire-and-forget) sau khi `set({ session })` trong 3 flow login ở [auth.store.ts](src/stores/auth.store.ts). `signOut()` gọi `unregisterPushToken()` TRƯỚC `supabase.auth.signOut()` để pass RLS update.
- Foreground duplicate suppression: `Notifications.setNotificationHandler` trả `shouldShowBanner=false` — realtime channel `notif:${appUserId}` đã handle toast/badge. FCM chỉ đẹp khi app background/killed.
- Tap deep link: `PushTapBridge` ở [_layout.tsx](src/app/_layout.tsx) gọi `setupNotificationListeners` 1 lần (KHÔNG re-mount theo session để bắt cold-start). Parse `data.route` từ FCM payload → `router.push()` + `dispatchNotificationRefetch()` để invalidate stores. Route mapping ở `getDeepLinkForNotification()` ([notificationRouter.ts](src/utils/notificationRouter.ts)).
- Bridge: trigger `notifications_fcm_insert/update` ([20260515120000_fcm_push_trigger.sql](supabase/migrations/20260515120000_fcm_push_trigger.sql)) gọi `pg_net.http_post` đến `/send-push` async — KHÔNG block transaction. UPDATE trigger chỉ fire khi `data->>'count'` thay đổi (dedup case) — KHÔNG fire khi user mark-as-read.
- Edge Function `send-push`: lookup notification + `fcm_token` → mint OAuth token (cache 55min) → POST FCM v1 → nếu UNREGISTERED/INVALID_ARGUMENT thì clear `fcm_token=NULL`. Service account JSON ở env var `FIREBASE_SERVICE_ACCOUNT`.
- **Secrets storage qua Supabase Vault** (KHÔNG dùng `ALTER DATABASE SET app.*` — Supabase managed reject với 42501 permission denied cho mọi role kể cả `postgres`). Function `_dispatch_push_notification` đọc từ `vault.decrypted_secrets WHERE name IN ('edge_function_url', 'edge_function_token')`. Pivot patch ở [20260515130000_fcm_push_vault_pivot.sql](supabase/migrations/20260515130000_fcm_push_vault_pivot.sql) (CREATE OR REPLACE function body cũ trong [20260515120000_fcm_push_trigger.sql](supabase/migrations/20260515120000_fcm_push_trigger.sql) — file cũ giữ nguyên để migration history truy vết, runtime đã pivot).
- **Setup deployment (1 lần)**:
  1. `supabase secrets set FIREBASE_SERVICE_ACCOUNT='<full-service-account-json>'`
  2. `SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_function_url', 'Edge Function URL prefix for FCM dispatcher');`
  3. `SELECT vault.create_secret('<service-role-jwt>', 'edge_function_token', 'Service-role JWT for Edge Function authorization');`
  4. `supabase functions deploy send-push`
  - **Rotate**: dùng `SELECT vault.update_secret('<secret-id>', '<new-value>')` — vault.create_secret CHỈ tạo mới, không upsert.
- Master toggle `UserSettings.push_enabled` (default true) ở settings: OFF → unregisterPushToken (token=NULL → send-push skip với `no_fcm_token`); ON → re-register. Độc lập với 4 toggle `notify_*` (filter ở `getGroupRecipients()` — không tạo notification row).
- **Khi `expo prebuild --clean`**: phần lớn FCM config Expo TỰ regenerate đúng vì app.json đã declare:
  - `expo.android.googleServicesFile: "./google-services.json"` → Expo tự copy `google-services.json` sang `android/app/` + add Google Services Gradle plugin (classpath + `apply plugin`).
  - Plugin `expo-notifications` trong app.json plugins → tự add `firebase-messaging` dependency + `POST_NOTIFICATIONS` permission.
  - `expo.android.blockedPermissions` chứa `AD_ID` → Expo tự inject `tools:node="remove"` vào AndroidManifest cho Analytics.
  - **KHÔNG cần restore tay** các thứ trên nếu app.json giữ nguyên config.
- **CẦN restore tay sau prebuild --clean** (Expo không có plugin tự sinh):
  - `signingConfigs.fairpay` block ở `android/app/build.gradle` (chi tiết section "Android build & signing").
  - Dòng `implementation("com.google.firebase:firebase-analytics")` ở `android/app/build.gradle` Firebase BoM block — Expo standard chỉ biết firebase-messaging qua expo-notifications plugin, KHÔNG biết Analytics. Nếu quên thì Analytics SDK bị remove → Dashboard ngừng nhận data từ build mới.
- Verify sau prebuild --clean: `git diff android/` xem có thiếu gì không (so với state đã work). Nếu app.json bị edit nhầm (mất `googleServicesFile` hoặc plugin `expo-notifications` hoặc `AD_ID` trong blockedPermissions) → prebuild sẽ KHÔNG sinh config tương ứng → restore app.json + prebuild lại. Memory chi tiết: [feedback_fcm_prebuild_overwrite.md](C:/Users/ADMIN/.claude/projects/d--fair-pay/memory/feedback_fcm_prebuild_overwrite.md).
- iOS chưa support — APNs cần Apple Developer cert + cấu hình khác. `registerForPushNotifications()` early-return `Platform.OS !== 'android'`.

### Tooling gotchas

#### Uniwind + Tailwind v4 scanner đọc toàn root project
- Uniwind cấu hình tailwind oxide scanner với pattern `**/*` từ `cssEntryFile` dirname (= project root) → scan TẤT CẢ file ở root, kể cả `CLAUDE.md`, `README.md`, `.json`, `.txt`. KHÔNG bị giới hạn ở `src/**/*.{ts,tsx}` của `tailwind.config.ts`.
- Tailwind regex `\\([\dA-Fa-f]{1,6}[\t\n\f\r ]?|[\S\s])` decode CSS escape `\xxxxxx`. Nếu input có `\<6-hex-digits>` mà giá trị > `0x10FFFF` (max Unicode), `String.fromCodePoint` throw `RangeError: Invalid code point`.
- **Tránh các pattern sau** trong bất kỳ file nào ở project root (đặc biệt CLAUDE.md, MEMORY.md, README.md, markdown link absolute path):
  - Windows path `\` separator → đổi sang `/` (markdown link nhận cả 2): `C:/Users/.../memory/feedback_xxx.md` thay vì `C:\Users\...\memory\feedback_xxx.md`.
  - Identifier / variable / filename / string bắt đầu bằng 6 ký tự hex liên tiếp sau `\`: `\feedba` ("feedback"), `\decade`, `\beefed`, `\cafebe`, `\abcdef`, `\decafe`... — tất cả `parseInt(hex,16) > 0x10FFFF` → crash. Quy tắc: chuỗi 6+ ký tự `[0-9a-fA-F]` liên tiếp ngay sau `\` là risk. Đặc biệt nguy với prefix `\feed`, `\dead`, `\cafe`, `\babe`, `\face` vì 4 ký tự đó toàn hex + thường nối với chữ Anh.
  - Test 5 chars hoặc ít hơn an toàn (vd `\faded` = 0xFADED < 0x10FFFF), nhưng nếu chữ thứ 6 là hex (vd `\fadedz` chỉ match 5 char vì z không hex → safe; nhưng `\faded1` match 6 → 0xFADED1 → CRASH).
- Bug đã gặp 2026-05-15: link `\Users\...\memory\feedback_fcm_prebuild_overwrite.md` trong CLAUDE.md → segment `\feedba` overflow → Metro bundle crash với `RangeError: Invalid code point 16707002`. Pin tailwindcss về version cũ KHÔNG fix vì bug có ở mọi 4.x. Real fix: sửa file gốc dùng `/` separator.
- Debug: convert decimal err code sang hex (`(N).toString(16)`) → grep project tìm chuỗi `\<6hex>`. Hoặc patch `node_modules/tailwindcss/dist/lib.js` function `ke` thêm `console.error` thay vì throw. Tham khảo [feedback_tailwind_oxide_scan_root.md](C:/Users/ADMIN/.claude/projects/d--fair-pay/memory/feedback_tailwind_oxide_scan_root.md).

#### npm install silent dep bumps
- `npm install <pkg>` **re-resolve toàn dep tree** — silent bump mọi caret-ranged dep (`^x.y.z`) lên version mới nhất trong major. `package.json` giữ nguyên (range), nhưng `package-lock.json` + `node_modules/` đổi → app behavior thay đổi mà user không thấy.
- Bug đã gặp: `npm install expo-notifications` bump `uniwind` 1.5.0→1.6.5 (pin nested `@tailwindcss/node@4.2.1`) + `react-native-reanimated` 4.2.1→4.3.1 (require worklets `0.8.x` mà worklets stay 0.7.4) → crash + gradle fail.
- **Fair Pay pin chặt** trong [package.json](package.json):
  - `dependencies`: 4 dep critical bỏ caret, dùng exact version (`"uniwind": "1.5.0"`, `"react-native-reanimated": "4.2.1"`, `"react-native-worklets": "0.7.2"`, `"tailwindcss": "4.2.2"`).
  - `overrides`: 6 dep enforce nested transitive (`uniwind`, `react-native-reanimated`, `react-native-worklets`, `tailwindcss`, `@tailwindcss/node` 4.1.17, `@tailwindcss/oxide` 4.1.17). Overrides ép cả nested deps (uniwind 1.5.0 pin `@tailwindcss/node@4.1.17` exact qua overrides).
- Khi cài package mới: chạy `npm install <pkg>` rồi check `git diff package-lock.json` ngay. Nếu thấy dep không liên quan bump → revert + thêm vào `overrides`. Hoặc dùng `npm install <pkg> --save-exact` để pin chặt version mới.
- Tham khảo [feedback_npm_install_silent_bumps.md](C:/Users/ADMIN/.claude/projects/d--fair-pay/memory/feedback_npm_install_silent_bumps.md).

### Testing
- Tests nằm trong `src/__tests__/` — chỉ test hàm thuần (utils).
- Luôn chạy `npx jest` + `npx tsc --noEmit` sau mỗi batch thay đổi.
- Khi thêm edge case cho split/settlement, nhớ test cả `amount >= 0` cho mọi member.
