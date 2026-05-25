# Offline-First Manual QA Scenarios

Checklist test scenarios cho offline-first system. Mỗi scenario test trên thiết bị
thật, tốt nhất 2 thiết bị để verify cross-device conflict.

## Setup
- Device A: user1@example.com, role admin trong group "Đà Lạt".
- Device B: user2@example.com, role member trong cùng group.
- Cả 2 đã đăng nhập, đã sync ít nhất 1 lần (SQLite mirror đầy đủ).

## Phase 1 — Read offline

### 1.1. Cold-start offline sau khi login lần đầu
**Step**: Login Device A online → close app → bật airplane mode → mở app.
**Expected**: App vào /(main) ngay (không loading vô hạn). Banner subtle "đang xem
offline" (KHÔNG hiện toast lỗi).
**Verify**: home, danh sách groups/trips, balance summary đều hiển thị từ SQLite cache.

### 1.2. Background → foreground khi offline
**Step**: Đang xem trip → home button → 1 phút → reopen app (vẫn offline).
**Expected**: App resume với data cũ, không reload. SyncBridge nhận AppState active
nhưng skip (vì offline).

### 1.3. Realtime catch-up khi reconnect
**Step**: Device A offline 5 phút. Device B online tạo expense.
**Step (B → A)**: Device A bật mạng.
**Expected**: SyncBridge fire sync. Pull delta theo watermark — expense mới của B xuất
hiện trong list Device A trong < 5s. Banner "Đang đồng bộ N thao tác" flash rồi
biến mất.

## Phase 2 — Write offline

### 2.1. Create expense offline → online
**Step**: Device A offline. Tạo expense "Bữa trưa 100k" trong trip.
**Expected**:
- Expense hiện ngay trong list (optimistic).
- Banner "Ngoại tuyến — 1 thao tác chờ đồng bộ" hiển thị top-of-screen.
- Balance tab cập nhật ngay (tính từ local SQLite).
**Step**: Bật mạng.
**Expected**:
- Sync engine fire → push queue → server tạo expense với client_request_id idempotency.
- Banner đổi "Đang đồng bộ 1 thao tác" → biến mất sau ~3s.
- Device B (online) nhận realtime notification "user1 đã thêm Bữa trưa 100k" (TRỄ — gửi khi push thành công).

### 2.2. Multiple writes offline, then sync
**Step**: Offline → tạo 5 expense + 2 payment + đổi tên 1 trip.
**Expected**: Banner "8 thao tác chờ đồng bộ".
**Step**: Bật mạng.
**Expected**:
- Push từng item theo FIFO. Mỗi item success → counter giảm.
- Cuối cùng tất cả 8 ops xuất hiện đúng trên Supabase Dashboard.

### 2.3. Idempotent retry safety
**Step**: Offline → tạo expense → bật mạng → trong lúc sync, restart app force-kill.
**Expected**:
- App restart → sync engine retry push → server thấy `client_request_id` đã tồn tại
  (UNIQUE constraint) → return existing row hoặc throw 23505 → queue mark done.
- Expense KHÔNG bị duplicate.

### 2.4. Soft-delete idempotency
**Step**: Device A offline xóa expense X. Device B (cùng admin) online cũng xóa X.
**Expected**:
- Server expense X có `deleted_at` set 1 lần (do device B online).
- Device A bật mạng → sync push delete → server `COALESCE(deleted_at, now())` → no-op
  (deleted_at đã có).
- KHÔNG có lỗi, queue mark done.

## Phase 3 — Conflict resolution

### 3.1. Rename trip 2 device offline
**Step**: Cả Device A và B offline. Cùng đổi tên trip "Đà Lạt" thành:
- A: "Đà Lạt 2025"
- B: "Đà Lạt Tết"
**Step**: Device A bật mạng → đổi của A lên server (server v→4).
**Step**: Device B bật mạng.
**Expected**:
- Sync engine của B push → server check base_version=3 ≠ current=4 → P0410.
- ConflictResolverModal hiện trên Device B:
  - "Bạn đổi thành 'Đà Lạt Tết'"
  - "Người khác đã đổi thành 'Đà Lạt 2025'"
- 3 button: Giữ của tôi / Giữ của họ / Xem sau.

### 3.2. Keep mine resubmit
**Step**: Tiếp scenario 3.1 — Device B chọn "Giữ của tôi".
**Expected**: Queue payload update với base_version=4, status='pending'. Sync engine fire
→ push lại → server check version=4 → match → UPDATE name='Đà Lạt Tết', v→5.
**Verify**: Device A (online) nhận realtime update → trip name = "Đà Lạt Tết".

### 3.3. Keep theirs
**Step**: Cũng từ 3.1 — Device B chọn "Giữ của họ".
**Expected**: Queue item bị xóa. Local mirror UPDATE name='Đà Lạt 2025'. UI Device B
cập nhật ngay.

### 3.4. Defer / Conflict Inbox
**Step**: Cũng từ 3.1 — Device B chọn "Xem sau".
**Expected**: Modal đóng. Banner pending count vẫn = 1. Settings → "Xung đột đồng bộ
(1)" entry. Tap → `/sync-conflicts` list 1 row.
**Step**: Tap "Giữ của họ" trong inbox.
**Expected**: Item drop, count → 0.

## Phase 4 — Image defer upload

### 4.1. Tạo expense + ảnh offline
**Step**: Device A offline. Tạo expense với ảnh chụp từ camera.
**Expected**:
- Ảnh hiện ngay từ local FileSystem path (`file://...pending_images/...jpg`).
- `pending_image_uploads` table có 1 row.
- Banner pending count = 1 (cho expense create) + queue image upload (chưa hiện trong
  count vì image worker chạy riêng).
**Step**: Bật mạng.
**Expected**:
- Sync engine push expense → server tạo với `image_url = file://...` (placeholder).
- imageUploadWorker chạy → presign + upload R2 + commit → server UPDATE expense.image_url.
- Pull lại → local mirror cập nhật image_url với R2 URL.
- Local file `pending_images/<id>.jpg` bị xóa.
- UI ảnh không flicker (hoặc flicker rất ngắn) vì cùng file → URL transition.

### 4.2. Network fail mid-upload
**Step**: Online tạo expense + ảnh → mid-upload tắt mạng.
**Expected**: try/catch ở ExpenseFormScreen catch network error → fall back stage local
→ expense vẫn được tạo (online path cho insert). Image deferred.
**Step**: Bật mạng lại.
**Expected**: Image worker pickup pending row → upload thành công.

### 4.3. Local file mất khi sync
**Step**: Tạo expense + ảnh offline → mở file manager xóa pending_images dir → bật mạng.
**Expected**: imageUploadWorker không tìm thấy file → mark dead → remove pending row.
Expense vẫn lên server nhưng `image_url` giữ placeholder file:// (sẽ broken). Acceptable
edge case.

## Phase 5 — Auth offline

### 5.1. Session expired offline
**Step**: Login online → offline 35 ngày (refresh token hết hạn).
**Expected**: App vẫn vào /(main) qua cachedIdentity. Mọi write enqueue offline OK.
**Step**: Bật mạng.
**Expected**: Supabase auth refresh fail → onAuthStateChange trả null session → AuthGate
fall back vào cachedIdentity → app vẫn ở /(main). Sync attempt push → 42501 unauthorized
→ queue mark dead → toast warning.
**Acceptable**: User phải đăng nhập lại thủ công.

### 5.2. Cài app mới offline (chưa từng login)
**Expected**: AuthGate detect không có session + cachedIdentity → redirect /(auth)/login.
Màn login require online. Không bypass được.

### 5.3. Sign out offline
**Step**: Đang offline, tap Sign out.
**Expected**: Local mirror clear + cachedIdentity clear + redirect login. Queue items
(nếu có) bị bỏ (acceptable — user logout có nghĩa "vứt thay đổi chưa sync").

## Phase 6 — Edge cases

### 6.1. Clock skew
**Step**: Đặt device clock lùi 1 năm. Tạo expense offline → bật mạng → sync.
**Expected**: Server gán `created_at = now()` (server time đúng). `client_created_at`
trong audit_logs lùi 1 năm. UI sort theo `COALESCE(client_created_at, created_at)`
→ audit list có thể hiển thị sai thứ tự cho action offline (acceptable, nếu user clock
sai họ phải fix).

### 6.2. DB corrupt / wipe
**Step**: Uninstall app + reinstall.
**Expected**: SQLite fresh (schema v3). `_sync_state` rỗng → full pull tất cả tables.
Queue rỗng. App như mới cài.

### 6.3. Queue 100+ pending
**Step**: Offline 1 ngày tạo 100 expenses.
**Expected**: pickPending limit 20/batch — push tuần tự. Total sync time tỷ lệ với số ops
nhưng không block UI (run trong background).

### 6.4. Realtime + offline mix
**Step**: Online tạo expense → realtime notification đến → ngay lập tức tắt mạng → mở
notifications screen.
**Expected**: Notification từ realtime đã được persist xuống SQLite (qua
useNotificationRealtime → notificationRepo.upsertFromServer) → hiện trong list khi
offline.

## Smoke test pre-deploy

Chạy nhanh trước khi push lên production:
- [ ] `npx tsc --noEmit` clean
- [ ] `npx jest` — 220 tests pass
- [ ] Cold-start offline (Scenario 1.1)
- [ ] Create expense offline → sync (Scenario 2.1)
- [ ] Rename trip conflict modal (Scenario 3.1)
- [ ] Image defer upload (Scenario 4.1)
