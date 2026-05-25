# Code Review — Fair Pay (Offline-First Architecture + Pinned Trips)

> **Phạm vi review:** Toàn bộ uncommitted changes trên branch `main` tại 2026-05-25.
> **Quy mô diff:** +4317 / -1332, 32 file modified, 30+ file mới (sync/, repositories/, polyfills/, pinned trips UI, conflict UI, 11 migrations mới).
> **Trọng tâm:** Sync engine offline-first, optimistic concurrency RPC, conflict resolution UI, pinned trips, SQLite local mirror, image staging.
> **CI status:** `npx tsc --noEmit` PASS (app code), `npx jest` PASS 227/227.
> **Review lần trước:** 2026-05-22 → 8 blocking, 21 important. Lần này verify lại tất cả + audit code mới.

---

## 1. Tổng quan kiến trúc

Đây là cú nâng cấp **kiến trúc lớn** — chuyển Fair Pay từ online-only sang offline-first thông qua mô hình write-through queue + SQLite local mirror + delta pull. Foundation rất chắc chắn:

- **Phân lớp rõ ràng:** Service → Sync (queue + dispatcher) → Supabase RPC, đi cùng Repository read-only đọc SQLite.
- **9 sync pattern** (P1 append-only, P2 soft-delete, P3 optimistic concurrency, P4 state machine, P5 LWW, P7 idempotent set) được áp dụng thống nhất cho 21+ mutation.
- **Conflict bus** + Conflict Inbox tách rời UI khỏi cơ chế resolution, đúng pattern reactive.
- **Idempotent enqueue** qua `client_request_id UNIQUE` + `ON CONFLICT DO NOTHING`.
- **Type discipline:** Không có vi phạm `: any` trong service/sync layer.

**Tiến độ kể từ lần review 2026-05-22:**

| Round 1 (2026-05-22) | Status hôm nay (2026-05-25) |
|---|---|
| 8 blocking | **8/8 FIXED** ✅ |
| 21 important | **5 FIXED** (I1, I7, I9, I14, B5 - dù B5 là blocking), **3 partial** (I16), **13 vẫn open** |

Tuy nhiên, audit lần này phát hiện **2 blocking mới** + **10 important mới** chủ yếu liên quan đến: ghost `cancelStaged`, memo compare miss field, dispatcher residual cross-user risk, lifecycle race condition.

---

## 2. Phát hiện theo severity

### 🔴 [blocking] — Phải fix trước khi merge

#### B-NEW-1. `cancelStaged()` là dead code → leak file ảnh + DB row khi user back/cancel form
**File:** [src/sync/imageStaging.ts:46](src/sync/imageStaging.ts#L46) (định nghĩa), 0 caller trong toàn bộ `src/`.

**Reproduce:** User offline → chọn ảnh trong [ExpenseFormScreen](src/components/expense/ExpenseFormScreen.tsx) → bấm Back/swipe close TRƯỚC khi submit. Logic hiện tại:
- `stageExpenseImage(expenseId, localPath)` đã copy file vào `documentDirectory/pending_images/<expenseId>.jpg` + INSERT row `pending_image_uploads`.
- `beforeRemove` listener ở [ExpenseFormScreen.tsx:202](src/components/expense/ExpenseFormScreen.tsx#L202) handle dialog confirm exit nhưng **không gọi `cancelStaged(expenseId)`**.
- `submittedRef` cleanup logic ở `handleConfirmExit` ([line 218](src/components/expense/ExpenseFormScreen.tsx#L218)) cũng không clean up.

**Impact:** File ảnh + DB row mồ côi vĩnh viễn. Với power user offline, có thể leak hàng chục MB sau vài tuần.

**Fix:**
```ts
// ExpenseFormScreen.tsx — trong handleConfirmExit
if (stagedImageId && !submittedRef.current) {
  await cancelStaged(stagedImageId);
}
```
Hoặc startup cleanup task quét `pending_image_uploads` không có expense matching → delete file + row.

#### B-NEW-2. `ExpenseTimelineRow.memo` compare bỏ sót `date`, `note`, `paid_by_member_id` + so sánh callback identity không ổn định
**File:** [src/components/trip/ExpenseTimelineRow.tsx:192-204](src/components/trip/ExpenseTimelineRow.tsx#L192-L204)

Custom comparator chỉ check `id`, `title`, `amount`, `image_url` + `onPress`/`onDelete` reference equality. Hệ quả:
- **Silent stale UI:** Sửa ngày, payer, hoặc note inline → row giữ nguyên hiển thị cũ cho đến khi 1 trong 4 field whitelist đổi.
- **Memo defeated:** Caller ([ExpensesTab](src/components/trip/ExpensesTab.tsx)) thường truyền arrow function mới mỗi render → `prev.onPress !== next.onPress` luôn true → memo vô tác dụng.

**Fix:** Hoặc bỏ comparator custom (dùng default shallow), hoặc thay bằng `prev.expense.updated_at === next.expense.updated_at` (single-field, đúng với offline-first semantics) + caller phải `useCallback` handler.

---

### ✅ Status các blocking từ review trước (2026-05-22) — đã verify

| ID | Status hôm nay | Evidence |
|---|---|---|
| **B1** search_path trigger | ✅ FIXED | [20260521100000_offline_first_version_columns.sql:31-59](supabase/migrations/20260521100000_offline_first_version_columns.sql#L31-L59) đã có `SET search_path = public, pg_temp` + [20260522140000_function_search_path_hardening.sql](supabase/migrations/20260522140000_function_search_path_hardening.sql) defense-in-depth |
| **B2** signOut flush queue | ✅ FIXED (có residual) | [auth.store.ts:282-292](src/stores/auth.store.ts#L282-L292) — `PendingSyncError` block signOut nếu `sync_queue` còn pending/conflict |
| **B3** Modal drop events | ✅ FIXED | [ConflictResolverModal.tsx:110-121](src/components/sync/ConflictResolverModal.tsx#L110-L121) — `useRef<ConflictEvent[]>([])` FIFO queue, `close()` shift event kế tiếp |
| **B4** Bus race late-subscriber | ✅ FIXED (single-slot) | [conflictBus.ts:22-52](src/sync/conflictBus.ts#L22-L52) — `lastEvent` buffer, deliver-once on subscribe |
| **B5** Migration không atomic | ✅ FIXED | [migrations.ts:301-312](src/db/migrations.ts#L301-L312) — `db.withTransactionAsync` bọc `up()` + INSERT version |
| **B6** Schema UNIQUE inline | ✅ FIXED | [schema.ts:292-307](src/db/schema.ts#L292-L307) — partial unique indexes `WHERE client_request_id IS NOT NULL` cho 6 bảng |
| **B7** keepTheirs dynamic SQL | ✅ FIXED (vượt spec) | [resolveConflict.ts:32-149](src/sync/resolveConflict.ts#L32-L149) — `ALLOWED_COLUMNS` whitelist + upsert/delete trong cùng `withTransactionAsync` (atomic rollback tốt hơn discard()) |
| **B8** runSync timeout | ✅ FIXED | [syncEngine.ts:22-85](src/sync/syncEngine.ts#L22-L85) — `Promise.race` với `SYNC_TIMEOUT_MS = 60_000` |

Engineering discipline **xuất sắc** — 8/8 blocking đều fix đúng cách, một số (B7) còn vượt spec.

---

### 🟡 [important] — Cần xử lý sớm

#### I1. ~~`createGroup` không có offline path~~ — ✅ FIXED
**File:** [src/services/group.service.ts:139-220](src/services/group.service.ts#L139-L220)
Đã implement đủ P1 pattern: client-gen `groupId` + `adminMemberId` + `clientRequestId` + placeholder invite code; `enqueueLocal()` write SQLite trong transaction + enqueue; dispatcher case [CREATE_GROUP](src/sync/pushDispatcher.ts#L234-L249) handle 23505 success. Migration [20260523120000_create_group_offline_first.sql](supabase/migrations/20260523120000_create_group_offline_first.sql) RPC `create_group` nhận `p_client_request_id` + `ON CONFLICT DO NOTHING RETURNING *`.

#### I7 + I14. ~~`update_user_settings` validate shape + LWW null check~~ — ✅ FIXED
**File:** [supabase/migrations/20260523130000_validate_user_settings_shape.sql](supabase/migrations/20260523130000_validate_user_settings_shape.sql)
Đã verify đủ 7 yêu cầu: reject non-object jsonb (`invalid_settings_shape`), validate `dark_mode` enum (`system|light|dark`), validate 7 boolean keys, merge với current_settings, reject `p_base_updated_at IS NULL`, cleanup pass chỉ touch dirty rows (giữ LWW base của row sạch), 4 errcode đã map trong [error.ts](src/utils/error.ts).

#### I9. ~~`create_group` thiếu `client_request_id`~~ — ✅ FIXED
**File:** [supabase/migrations/20260523120000_create_group_offline_first.sql:49-64](supabase/migrations/20260523120000_create_group_offline_first.sql#L49-L64)
Superseded migration `20260522120000` bằng v2 nhận `p_client_request_id` + `ON CONFLICT (client_request_id) DO NOTHING RETURNING * INTO v_group`, kèm `DROP FUNCTION IF EXISTS public.create_group(text)` clean.

#### I-NEW-1. Dispatcher 3 case lazy-load `getAuthUserId()` → vẫn còn cross-user risk khi token-expiry / session invalidation
**File:** [src/sync/pushDispatcher.ts](src/sync/pushDispatcher.ts) — case `CREATE_TRIP` (~L275), `DELETE_PRESET` (~L362), `DELETE_NOTIFICATION` (~L451)

B2 fix chỉ chặn flow `signOut()` chủ động. Nhưng nếu:
- Session expire (token hết hạn, admin disable user).
- `auth.onAuthStateChange` emit `SIGNED_OUT` không qua `useAuthStore.signOut()`.
- Force logout từ background.

→ queue items chạy với `getAuthUserId()` của user kế tiếp.

`PendingSyncError` JSDoc ở [auth.store.ts:28-31](src/stores/auth.store.ts#L28-L31) cũng tự thừa nhận điều này. **Fix triệt để:** stash `actor_user_id` vào `payload` lúc enqueue → dispatcher đọc từ payload, không lookup runtime.

#### I-NEW-2. `error.ts` thiếu mapping cho 8+ Postgres error codes
**File:** [src/utils/error.ts](src/utils/error.ts)

Các errcode RPC mới raise nhưng KHÔNG có trong `ERROR_MAP`:
- `version_conflict` (`P0410`) — raise bởi 6 RPC P3 → fallback message "Đã xảy ra lỗi, vui lòng thử lại". May mắn `conflictBus` detect qua errcode chứ không qua message → app vẫn hoạt động, nhưng nếu UI có chỗ nào catch generic → user thấy message sai.
- `lww_stale` (`P0410`)
- `payment_not_found`, `member_not_found`, `preset_not_found`, `user_not_found`, `group_not_found` (`P0002`)
- `not_owner` (`42501`)

**Fix:** Thêm 8 keys vào [error.ts ERROR_MAP](src/utils/error.ts).

#### I-NEW-3. `delete_payment` audit log lưu `before_data = NULL, after_data = NULL` — forensic gap
**File:** [supabase/migrations/20260521100200_optimistic_concurrency_rpcs.sql:586-588](supabase/migrations/20260521100200_optimistic_concurrency_rpcs.sql#L586-L588)
```sql
VALUES (v_group_id, v_trip_id, 'payment.delete', v_actor, p_payment_id, NULL, NULL, p_client_created_at);
```
Khi user dispute "ai đã xóa payment 500k", admin không có cách nào biết được số tiền/from/to → vô dụng cho forensic. Các delete RPC khác (vd `delete_trip`) đều capture `before_data`.

**Fix:** RPC đã SELECT row hiện tại để check authz → tận dụng:
```sql
v_before := jsonb_build_object('amount', v_amount, 'from_member_id', v_from, 'to_member_id', v_to);
INSERT INTO audit_logs (...) VALUES (..., v_before, NULL, ...);
```

#### I-NEW-4. `useQueueStats` effect thứ 2 không có cancel guard + double-poll khi `isSyncing` flip
**File:** [src/hooks/useQueueStats.ts:73-80](src/hooks/useQueueStats.ts#L73-L80)

Effect thứ 2 fire mỗi khi `isSyncing` flip, gọi `setStats` từ Promise không guard. Hệ quả:
- Rapid unmount → setState on unmounted component (warning React).
- Effect 1 (polling 5s khi foreground) + effect 2 (trigger on sync change) → có thể fetch 2 lần liên tiếp khi `isSyncing` flip rất nhanh.

**Fix:** Local `cancelled` ref guard + skip nếu `AppState.currentState !== 'active'`.

#### I-NEW-5. `OfflineBanner` measuredHeight stale khi font scale / orientation / message length đổi
**File:** [src/components/common/OfflineBanner.tsx:99-103](src/components/common/OfflineBanner.tsx#L99-L103)

`onLayout` cache height 1 lần, nhưng `Animated.View` container có `overflow: 'hidden'` + height=0 lúc collapsed → onLayout của child không re-fire chuẩn khi message text dài hơn (vd "Đang đồng bộ..." → "12 thay đổi đang chờ"). User thấy content bị clip.

**Fix:** Re-measure khi message text thay đổi, hoặc dùng `maxHeight` animation trên wrapper KHÔNG overflow hidden.

#### I-NEW-6. `OfflineBanner` không `NetInfo.fetch()` initial → banner không show khi cold-start offline
**File:** [src/components/common/OfflineBanner.tsx:50-62](src/components/common/OfflineBanner.tsx#L50-L62)

`app.store.isOnline` default = `true`. Hook chỉ subscribe `addEventListener` — sự kiện đầu tiên có thể mất vài giây trên Android cold-start. Nếu user mở app khi offline → không thấy banner cho đến khi mạng flip lần đầu.

**Fix:** `NetInfo.fetch().then(s => setOnline(s.isConnected ?? true))` trước subscribe.

#### I-NEW-7. `PinPickerSheet` rapid double-tap có thể vượt `MAX_PINNED_TRIPS`
**File:** [src/components/home/PinPickerSheet.tsx:55-83](src/components/home/PinPickerSheet.tsx#L55-L83)

`pinnedCount` capture từ selector lúc render. Hai trip tap trong cùng 1 frame → cả hai pass gate `pinnedCount >= MAX_PINNED_TRIPS` trước khi optimistic update commit → 3 pin local (rồi server reject 1). `pendingIds` block chỉ same trip, không global count.

**Fix:** Đọc `useTripStore.getState()` trong handler (giống pattern `DraggablePair.commitSwap`).

#### I-NEW-8. `sync-conflicts.tsx` `keepTheirs` không handle `serverData === null`
**File:** [src/app/(main)/sync-conflicts.tsx:85-102](src/app/(main)/sync-conflicts.tsx#L85-L102)

Khi `fetchServerEntity` trả null (server đã xóa entity), `keepMine` discard local đúng nhưng `keepTheirs(item, null)` thì pass null xuống `resolveConflict.keepTheirs` → có thể write null vào mirror hoặc throw silently. Behavior phụ thuộc op_type.

**Fix:** Align với `keepMine` — null server response = treat as "server đã xóa" → DELETE local mirror + discard queue.

#### I-NEW-9. `conflictBus.lastEvent` single-slot → multiple emits trước subscribe lose all but last
**File:** [src/sync/conflictBus.ts:22](src/sync/conflictBus.ts#L22)

Hiện chỉ buffer 1 event. Nếu push cycle bootstrap emit 3 conflict song song (rare nhưng có) → 2 cái cũ mất modal popup. Inbox vẫn thấy (vì `status='conflict'` trong sync_queue), nhưng UX kém.

**Fix:** `bufferedEvents: ConflictEvent[]` với cap 10. Khi subscribe → drain hết queue.

#### I-NEW-10. `syncEngine.run()` timeout không AbortController → in-flight side-effects vẫn áp dụng sau timeout
**File:** [src/sync/syncEngine.ts:77](src/sync/syncEngine.ts#L77)

`Promise.race` resolve outer promise nhưng fetch underlying vẫn chạy → có thể UPDATE watermark / DB write sau khi `run()` thứ 2 đã start → out-of-order state.

**Fix:** Plumbing `AbortController` qua pull/push workers. Trade-off: phức tạp. Acceptable risk hôm nay vì 60s window hẹp.

---

#### Các finding cũ vẫn OPEN (từ review 2026-05-22)

- **I2** ~~closeTrip/reopenTrip base_version race~~ — đã verify FALSE POSITIVE trong review trước, không cần fix.
- **I3** `pinTrip` overflow position khi local đủ 2 pin — vẫn open. UNIQUE index sẽ throw 23505 → conflict modal nhưng local mirror sai.
- **I4** AuthGate accept `cachedIdentity` không re-validate session — vẫn open. Token invalid → user thấy data nhưng mutation fail.
- **I5** OfflineBanner chiếm chỗ layout flow → layout shift — vẫn open + I-NEW-5/I-NEW-6 cùng file.
- **I6** `useQueueStats` polling spam — vẫn open + I-NEW-4 cùng file.
- **I8** `update_*` RPC declare `p_client_request_id` không consume — **STILL OPEN** trong [20260521100200_optimistic_concurrency_rpcs.sql](supabase/migrations/20260521100200_optimistic_concurrency_rpcs.sql). Comment header L16-20 nói là intentional ("client diff state recognize as retry success") — nếu chấp nhận thì nên drop param hoặc comment trong body để reviewer khỏi nhầm.
- **I10** `pushDispatcher` không truyền `p_client_request_id` cho 4 RPC create — cần verify lại đã sửa chưa cho `create_expense`/`create_payment` etc.
- **I11** `updateFcmToken` swallow non-network errors — **STILL OPEN** ([user.service.ts:226](src/services/user.service.ts#L226)). Blanket `console.warn`, không phân biệt network vs RLS/42501.
- **I12** `upsertRow()` không LWW guard `WHERE excluded.updated_at >= updated_at` — vẫn open ([_shared.ts:65-77](src/repositories/_shared.ts#L65-L77)).
- **I13** `notifications` SQLite thiếu cột `deleted_at` — vẫn open (cần verify với server schema).
- **I15** `imageUploadWorker` check expense local thay vì queue pending — vẫn open ([imageUploadWorker.ts:88-104](src/sync/imageUploadWorker.ts#L88-L104)).
- **I16** `isNetworkError` duplication — **PARTIALLY FIXED**. `writeFallback.ts` export `isNetworkError` (consumer side OK), nhưng `fallback.ts` vẫn copy-paste lại. Substring match (`'timeout'`, `'aborted'`) chưa tighten thành `err.name === 'TypeError'`.
- **I17** Inline `msg.includes('failed to fetch')` 4 chỗ — **STILL OPEN**. Verified:
  - [expense.service.ts:320-323](src/services/expense.service.ts#L320-L323) + [438-441](src/services/expense.service.ts#L438-L441)
  - [payment.service.ts:217-220](src/services/payment.service.ts#L217-L220) + [297-300](src/services/payment.service.ts#L297-L300)
  - `group.service.ts` / `user.service.ts` đã import → migration không đồng đều giữa các service.
- **I18** `assertRole` qua local repo stale → reject thao tác hợp lệ — vẫn open ([group.service.ts:1009-1020](src/services/group.service.ts#L1009-L1020)).
- **I19** `cancelStaged` chưa được wire — đã promote lên **B-NEW-1** (blocking).
- **I20** `update_user_display_name` không log audit — **STILL OPEN** ([20260521100200_optimistic_concurrency_rpcs.sql:228-263](supabase/migrations/20260521100200_optimistic_concurrency_rpcs.sql#L228-L263)). Cùng RPC cũng KHÔNG nhận `p_client_created_at` — inconsistent với các update RPC khác.
- **I21** `audit_logs` không lưu khi offline create — vẫn open. Cần move audit vào RPC server-side (như `create_expense`) hoặc enqueue audit op riêng.

---

### 🟢 [nit] — Polish nhỏ

- **N1.** `pullExpenses` chunk size 50 cho `expense_splits` — trip 1000 expense → 20 round-trip. Có thể move vào Edge Function trả gộp. [src/sync/pullWorker.ts:166-188](src/sync/pullWorker.ts#L166-L188)
- **N2.** `crypto.randomUUID()` trong sync layer — RN không guarantee `globalThis.crypto`. Dùng `expo-crypto` an toàn hơn. [src/sync/syncQueue.ts:42](src/sync/syncQueue.ts#L42)
- **N3.** `MARK_ALL_NOTIFICATIONS_READ` op_type định nghĩa nhưng KHÔNG handle ở dispatcher → throw "Unknown op_type" nếu service enqueue. [src/sync/types.ts](src/sync/types.ts) vs [src/sync/pushDispatcher.ts](src/sync/pushDispatcher.ts).
- **N4.** `tryServerOrQueue` wrapper định nghĩa nhưng KHÔNG ai dùng → dead code. [src/sync/writeFallback.ts:28-47](src/sync/writeFallback.ts#L28-L47)
- **N5.** `_forceSyncImageUrl` export public với underscore prefix — dễ gọi nhầm từ UI. Mark `@internal`. [src/sync/imageUploadWorker.ts:177](src/sync/imageUploadWorker.ts#L177)
- **N6.** `PinnedTripsSection.DraggablePair` hard-code `length === 1` vs else — nếu `MAX_PINNED_TRIPS` tăng >2 thì sai render. [src/components/home/PinnedTripsSection.tsx:88-91](src/components/home/PinnedTripsSection.tsx#L88-L91)
- **N7.** `ExpenseImageThumb` fallback initial `/\p{L}/u` không match emoji/digit → ô "?" cho title "🍕 Pizza" hoặc "1 ly cafe". Đổi sang `/\S/`. [src/components/trip/ExpenseImageThumb.tsx:18-22](src/components/trip/ExpenseImageThumb.tsx#L18-L22)
- **N8.** `notifications.deleted_at` index partial cho active rows — sync pull cần thấy deleted event để dọn local. Comment rõ ràng.
- **N9.** `markFailed` backoff comment chưa rõ retry_count=0 → first retry = 30s.
- **N10.** `payments(group_id)` thiếu index → full scan ở `listByGroup`. [src/db/schema.ts](src/db/schema.ts)
- **N11.** `audit_logs` thiếu `idx_audit_logs_created_at` → prune chậm khi log lớn.
- **N12.** `update_*` RPC raise P0410 với DETAIL plain text → client parse fragile. Dùng HINT chứa jsonb cấu trúc.
- **N13.** `pinned_trips` RLS allow DELETE direct → bypass `unpin_trip` RPC compaction logic → orphan position=1. REVOKE DELETE FROM authenticated, force qua RPC. [supabase/migrations/20260519150000_add_pinned_trips.sql:27-28](supabase/migrations/20260519150000_add_pinned_trips.sql#L27-L28)
- **N14.** `pin_trip` COUNT(*)+ INSERT có race window — 2 RPC concurrent đều pass count=1 → 23505. Map thành error "Đã đạt tối đa pin" rõ hơn. [supabase/migrations/20260519150100_pinned_trips_rpcs.sql:69](supabase/migrations/20260519150100_pinned_trips_rpcs.sql#L69)
- **N15.** `SyncConflictsScreen` thiếu error state, busy lock → button stuck nếu fetch throw. [src/app/(main)/sync-conflicts.tsx:57-87](src/app/(main)/sync-conflicts.tsx#L57-L87)
- **N16.** `update_preset` UPDATE WHERE thiếu `AND deleted_at IS NULL` (defensive). [20260521100200:322-330](supabase/migrations/20260521100200_optimistic_concurrency_rpcs.sql#L322-L330)
- **N17.** `update_preset` không validate `p_trip_id` thuộc group user đang member + `p_paid_by_member_id` active. Apply-time graceful nhưng nên fail-fast.
- **N18.** `ExpenseTimelineSectionHeader` không `React.memo()` → re-render mỗi parent update khi dùng làm SectionList header. [src/components/trip/ExpenseTimelineSectionHeader.tsx:21](src/components/trip/ExpenseTimelineSectionHeader.tsx#L21)
- **N19.** `ConflictResolverModal` dùng emoji `📱` / `☁` inline (L209, L215). CLAUDE.md nói tránh emoji — keep nếu intentional UX.
- **N20.** `PinnedTripCard.accessibilityLabel` lẫn tiếng Anh "Pinned trip" — nên là "Chuyến đã ghim". [src/components/home/PinnedTripCard.tsx:54](src/components/home/PinnedTripCard.tsx#L54)
- **N21.** `sync-conflicts.tsx` dùng `c.warning` cho `last_error` — convention dự án dùng `c.danger` cho error. [src/app/(main)/sync-conflicts.tsx:131-134](src/app/(main)/sync-conflicts.tsx#L131-L134)
- **N22.** `TripsTab` inline `📌` emoji subtitle — consider icon component. [src/components/group/TripsTab.tsx:41](src/components/group/TripsTab.tsx#L41)
- **N23.** `PinPickerSheet` disabled row vẫn tappable (Pressable không có `disabled` prop) → ripple android trigger. [src/components/home/PinPickerSheet.tsx:135-148](src/components/home/PinPickerSheet.tsx#L135-L148)
- **N24.** `inviteCode.ts` dùng `globalThis.crypto.randomUUID()` → Hermes guarantee thay đổi theo SDK. Project đã có `expo-crypto` ở chỗ khác → dùng cho nhất quán. [src/utils/inviteCode.ts:15](src/utils/inviteCode.ts#L15)
- **N25.** `gradientFromString` trả HSL string → `expo-linear-gradient` lịch sử có vấn đề parse trên một số platform. Convert HSL→hex để safe. [src/utils/gradientFromString.ts:24-28](src/utils/gradientFromString.ts#L24-L28)
- **N26.** `audit_logs.client_created_at` nullable — verify UI sort NULL-safe (server-tagged events).

---

### 💡 [suggestion] — Đề xuất kiến trúc

- **S1.** Extract `NETWORK_PATTERNS` chung thành `src/utils/network.ts` — closure I16 + I17 đồng thời. 6 chỗ định nghĩa lại hiện tại.
- **S2.** Stash `actor_user_id` vào `payload` lúc enqueue → dispatcher không cần lazy-load `getAuthUserId()` → fix triệt để I-NEW-1 (cross-user vẫn còn risk dù B2 đã chặn signOut chủ động).
- **S3.** `useSyncStatusStore` singleton Zustand thay polling N timer — emit từ `syncQueue` write ops.
- **S4.** Capture `actor_name` snapshot trong payload `delete_*` op để giữ chronological correctness của notification khi user đổi tên giữa offline-window.
- **S5.** Reset stuck `in_flight` items > 5 phút → `pending` ở `syncEngine.run()` startup.
- **S6.** `pullAll` collect errors per-table → emit ra UI banner "Pull lỗi 3/12 table" thay vì silent skip.
- **S7.** `create_payment` 12 tham số khó maintain → nhận `p_payload jsonb`. Trade-off type safety vs flexibility.
- **S8.** Migration nên có dependency header note (`-- depends on: _log_action, _create_notifications_dedup`) — deploy lên fresh env dễ thiếu.
- **S9.** Unit test cho `isNetworkError` với edge: `null`, `undefined`, object không có `.message`, error có `.cause` chain.
- **S10.** Plumb `AbortController` qua pull/push workers để timeout thật sự cancel HTTP fetch (closure I-NEW-10).
- **S11.** Startup cleanup task quét orphan `pending_image_uploads` + file mồ côi (defense-in-depth ngoài B-NEW-1 fix).
- **S12.** Test coverage cho sync engine (queue, dispatcher, conflict resolution) — hiện chỉ test util thuần.

---

### 🎉 [praise] — Điểm tốt nổi bật

- **P1.** Pattern `tryServerOrQueue` rất clean — service code không cần biết logic queue ([src/sync/writeFallback.ts](src/sync/writeFallback.ts)).
- **P2.** Idempotent enqueue qua `client_request_id UNIQUE + ON CONFLICT DO NOTHING` ([src/sync/syncQueue.ts:52](src/sync/syncQueue.ts#L52)) — replay-safe đẹp.
- **P3.** Lazy `await import()` cho `auth.helper` trong 3 case dispatcher — đúng pattern tránh circular như CLAUDE.md cảnh báo.
- **P4.** `setWatermark` chỉ update khi monotonic increasing ([src/sync/syncState.ts:55-62](src/sync/syncState.ts#L55-L62)) — chống regression watermark khi 2 pull cycle race.
- **P5.** Bus listener pattern thay Zustand store cho conflict events — tránh re-render toàn app.
- **P6.** **B7 fix vượt spec:** `resolveConflict.keepTheirs` dùng `withTransactionAsync` bao gồm cả `DELETE FROM sync_queue` — atomic rollback đúng nghĩa, tốt hơn suggest "rollback discard()" của reviewer trước.
- **P7.** **B6 fix:** partial unique index `WHERE client_request_id IS NOT NULL` cho 6 bảng + comment giải thích rationale — allow NULL trong local mirror, chỉ enforce trên row đã sync. Đỉnh.
- **P8.** **B2 fix:** `PendingSyncError` class với JSDoc cite cross-user corruption rationale + dispatcher lazy-load risk — comment chất lượng cao, future-proof.
- **P9.** `pinned_trips` xử lý ghost-row cleanup trước khi check limit — tránh false positive "max_pinned_reached" khi UI chỉ thấy 1 card. Comment giải thích lý do không dùng RLS COUNT cũng tuyệt vời. [supabase/migrations/20260519150000_add_pinned_trips.sql:33-47](supabase/migrations/20260519150000_add_pinned_trips.sql#L33-L47)
- **P10.** `DEFERRABLE INITIALLY DEFERRED` cho `pinned_trips_user_pos_unique` — pattern atomic swap đúng.
- **P11.** `delete_payment` dùng `COALESCE(deleted_at, now())` + audit chỉ insert khi `v_current_deleted_at IS NULL` — soft-delete idempotent chuẩn P2 (chỉ trừ `before_data` NULL gap — I-NEW-3).
- **P12.** `expense_presets` soft-delete migration update đầy đủ 3 indexes (global, trip-scope, trip-lookup) đều có `AND deleted_at IS NULL` — không miss case.
- **P13.** LWW tolerance 1ms cho `update_user_settings` — detail tốt cho clock-skew.
- **P14.** `audit_logs` sort theo `COALESCE(client_created_at, created_at)` — clock-skew-safe đúng spec offline-first.
- **P15.** `is_virtual` map qua `!!row.is_virtual` ([src/repositories/groupMember.repo.ts:26](src/repositories/groupMember.repo.ts#L26)) — đúng convention CLAUDE.md.
- **P16.** `safeJsonParse` + `jsonStringify` shared util — repo nhất quán parse JSON.
- **P17.** Mọi list query có soft-delete đều filter `deleted_at IS NULL` + `group_members.left_at IS NULL` consistent.
- **P18.** `getAuthUserId()` ([src/services/auth.helper.ts:20-57](src/services/auth.helper.ts#L20-L57)) — 30s cache + offline fallback `_auth_cache`, comment rõ ràng từng đường rơi.
- **P19.** `fetchUserBalanceSummary` Promise.all + Map pre-index thay vì N+1 filter — đúng quy ước CLAUDE.md.
- **P20.** WAL mode + foreign_keys ON trong `initDatabase` — base setting tốt.
- **P21.** Memoization tốt: `PinnedTripCard`, `ExpenseImageThumb`, `ExpensesTab`, `TripsTab`, `PinnedTripsSection` đều `React.memo()` đúng chỗ.
- **P22.** `gradientFromString` deterministic + có 7 unit test + FNV-1a hash chọn đúng — fast, well-distributed.
- **P23.** Money sign convention KHÔNG vi phạm — không `Math.abs` quanh `<Money showSign>` trong file mới.
- **P24.** BottomSheet IME convention OK — `PinPickerSheet`/`TripActionSheet` không có TextInput → không cần uncontrolled-ref pattern.
- **P25.** TypeScript discipline: KHÔNG có `: any` trong toàn sync + service layer. 227/227 tests pass, app code typecheck pass.
- **P26.** `MembersTab` xử lý `isPendingInviteCode` rất tốt: disable share, swap icon Clock, hint "Sẽ hiện sau khi đồng bộ" — UX offline-first chỉn chu.
- **P27.** Defense-in-depth migration `20260522140000_function_search_path_hardening.sql` — idempotent `CREATE OR REPLACE` cho 3 functions kể cả khi source-of-truth đã pin → ngăn drift trên môi trường cũ.

---

## 3. Bảng điểm tổng kết

| Khu vực | Điểm /10 | Δ vs 2026-05-22 | Nhận xét |
|---|---|---|---|
| **Sync engine architecture** | **9.0** | +0.5 | 8/8 blocking từ review trước đã fix đúng cách. B7 vượt spec với transactional rollback. Còn: residual cross-user qua dispatcher (I-NEW-1), bus single-slot (I-NEW-9), no abort on timeout (I-NEW-10). |
| **Service layer offline-first** | **7.5** | +0.5 | I1 (createGroup offline) đã fix đẹp. Còn: inline `msg.includes` 4 chỗ (I17), `updateFcmToken` swallow (I11). |
| **SQL migrations & RPC security** | **8.0** | +1.5 | B1 đã đóng (source + hardening). I7+I14 fix qua migration mới rất bài bản. I9 (create_group idempotent) closed. Còn: I8 (param unused), I20 (audit miss), I-NEW-3 (delete_payment NULL before_data), I-NEW-2 (error codes thiếu trong TS map). |
| **SQLite + Repository** | **8.0** | +1.5 | B5 + B6 fix đẹp. Còn: `upsertRow` không LWW guard (I12). |
| **UI / Conflict resolution** | **7.0** | +1.0 | B3 + B4 fix đẹp. Conflict modal queue + FIFO pattern chuẩn. Còn: B-NEW-2 memo bug (silent stale UI), I-NEW-4/5/6 OfflineBanner + useQueueStats issues, I-NEW-7 PinPickerSheet rapid-tap. |
| **Type safety** | **9.5** | +0.5 | Zero `: any` violation. App code typecheck pass. |
| **Test coverage** | **6.5** | +1.0 | 227 tests pass (utils + format + grouping + r2 + haptics + notif + invite + gradient). Vẫn chưa có integration test cho sync engine — critical paths untested. |
| **Image upload defer** | **5.5** | — | `cancelStaged` chưa wire (B-NEW-1) → leak chắc chắn xảy ra. |

**Điểm tổng:** **7.6/10** (+0.6 vs lần trước). Foundation engineering **xuất sắc**, fix quality cao (B7 còn vượt spec). Nhưng còn **2 blocking mới** (B-NEW-1 image leak, B-NEW-2 memo correctness) phải đóng trước ship.

---

## 4. Danh sách hành động ưu tiên (rolling roadmap)

### Sprint 0 — Blocking phải fix trước khi merge (1-2 ngày)

1. **[B-NEW-1]** Wire `cancelStaged()` vào `handleConfirmExit` của ExpenseFormScreen + startup orphan cleanup task. (1-2 giờ)
2. **[B-NEW-2]** Sửa `ExpenseTimelineRow.memo` — dùng `updated_at` comparator hoặc bỏ custom compare. Caller dùng `useCallback`. (1 giờ)

### Sprint 1 — Important phải fix trong tuần này (3-5 ngày)

3. **[I-NEW-1]** Stash `actor_user_id` vào `payload` lúc enqueue cho 3 case dispatcher (CREATE_TRIP, DELETE_PRESET, DELETE_NOTIFICATION). (2-3 giờ)
4. **[I-NEW-2]** Thêm 8 error code mapping vào `error.ts` (version_conflict, lww_stale, *_not_found, not_owner). (30 phút)
5. **[I-NEW-3]** `delete_payment` capture `before_data` từ row SELECT. (30 phút)
6. **[I-NEW-4]** `useQueueStats` cancelled ref + AppState check. (30 phút)
7. **[I-NEW-5, I-NEW-6]** `OfflineBanner` re-measure on message change + `NetInfo.fetch()` initial. (1 giờ)
8. **[I-NEW-7]** `PinPickerSheet` đọc `getState()` trong handler. (15 phút)
9. **[I-NEW-8]** `sync-conflicts.tsx` keepTheirs handle null server (treat as deleted). (30 phút)
10. **[I-NEW-9]** `conflictBus` đổi thành `bufferedEvents[]` cap 10. (30 phút)
11. **[I17]** Refactor 4 inline `msg.includes` → `isNetworkError`. (30 phút)
12. **[I16]** Dedup `isNetworkError` về `src/utils/network.ts` + tighten match. (1 giờ)
13. **[I11]** `updateFcmToken` distinguish network vs RLS error → bubble RLS lên. (30 phút)
14. **[I19]** Reaffirm B-NEW-1 fix coverage.

### Sprint 2 — Important còn lại (1-2 tuần)

15. **[I3]** `pinTrip` overflow handling friendly error.
16. **[I4]** `AuthGate` session re-validate + banner "Phiên hết hạn".
17. **[I5]** `OfflineBanner` absolute position (kèm I-NEW-5/6 fix).
18. **[I6]** `useSyncStatusStore` singleton (S3).
19. **[I8]** Comment unused `p_client_request_id` trong RPC body HOẶC drop param.
20. **[I12]** `upsertRow` LWW guard `WHERE excluded.updated_at >= mirror.updated_at`.
21. **[I13]** Verify `notifications.deleted_at` SQLite mirror khớp Postgres schema.
22. **[I15]** Image worker check `syncQueue.hasPendingForEntity('expense', id)` trước upload.
23. **[I18]** `assertRole` server fallback khi local repo stale.
24. **[I20]** `update_user_display_name` audit log + `p_client_created_at`.
25. **[I21]** Audit log offline create (RPC server-side hoặc enqueue audit op riêng).
26. **[I-NEW-10]** Plumb `AbortController` qua pull/push workers (S10).

### Sprint 3 — Polish & test coverage (1 tháng)

27. 26 nit items.
28. **Test coverage:** sync engine integration tests — `isNetworkError`, `syncQueue` enqueue/dispatch, `pullWorker` watermark, `resolveConflict.keepMine/keepTheirs` idempotency. Mock SQLite + Supabase client.
29. UX copy: "Đang offline...", "Phiên hết hạn", "Đang đồng bộ N thay đổi...".

---

## 5. Ghi chú cuối

Lần review thứ 2 cho thấy team đã **xử lý 8/8 blocking** + **5/21 important** từ round 1 trong **3 ngày** — engineering velocity rất cao và chất lượng fix tốt (B7 vượt spec, B2 có JSDoc cite rationale, B1 defense-in-depth qua 2 migration).

Các **blocking mới** chủ yếu là edge cases discover được khi đào sâu (B-NEW-1 cancelStaged: dead code, B-NEW-2 memo compare miss field) — không phải regression của round 1. Round 2 nhiều important items hơn vì coverage rộng hơn (xét cả components/home/, components/sync/, hooks/, gradient utils, invite code).

**Khuyến nghị merge:** Sau Sprint 0 (2 blocking mới). Sprint 1-2 có thể ship sau qua patch release. Foundation đã production-grade — chỉ cần đóng 2 blocking + 10 important mới trước khi mass-rollout.

Đặc biệt nhấn mạnh: **B-NEW-1 sẽ gây disk leak chắc chắn xảy ra** với user offline rồi cancel form — không phải corner case. **B-NEW-2 sẽ gây silent stale UI** khi user sửa date/note expense — UX bug nhìn thấy được. Hai vấn đề này không thể defer.
