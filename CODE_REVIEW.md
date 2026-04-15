# Báo cáo Review Code — SplitVN (fair-pay)

**Codebase**: React Native (Expo 55) + Supabase + Zustand + HeroUI Native
**Số file review**: 42 file, ~4.000 dòng code
**Tests**: 3 bộ test, 71 test cases — tất cả PASS
**Ngày review**: 2026-04-15

---

## Đánh giá tổng thể: **Yêu cầu chỉnh sửa (Request Changes)**

Codebase có cấu trúc tốt, phân tách rõ ràng giữa các tầng (utils, services, stores, UI). Logic nghiệp vụ về tài chính được test kỹ lưỡng, công thức làm tròn VND đúng quy tắc. Tuy nhiên, có một số vấn đề cần xử lý trước khi ship — đặc biệt về **bảo mật**, **tính nhất quán dữ liệu**, và **race conditions**.

---

## 1. BẢO MẬT

### 1.1 `audit.service.ts` dùng `auth.id` thay vì `users.id` làm `actor_id`

**Mức độ**: 🔴 **[blocking]**

Tại `src/services/audit.service.ts` dòng 73-84, hàm `logAction` ghi `user.id` (Supabase auth UUID) vào trường `actor_id`, nhưng foreign key `audit_logs.actor_id` tham chiếu đến bảng `users(id)` — là user ID cấp ứng dụng, không phải auth UUID. Mọi service khác đều sử dụng `getAuthUserId()` để chuyển đổi `auth_id → users.id`, nhưng audit bỏ qua bước này.

**Hậu quả**:
- Ràng buộc FK có thể thất bại (audit được bọc trong `try/catch` nên lỗi bị nuốt)
- `fetchAuditLogs` làm giàu tên actor bằng cách join `users.id`, nên tất cả log sẽ hiện tên là "Ẩn danh"

**Gợi ý sửa**: Dùng cùng pattern `getAuthUserId()` trong `logAction`:
```ts
const userId = await getAuthUserId(); // chuyển đổi sang users.id
if (!userId) return;
// ...dùng userId làm actor_id
```

### 1.2 `fetchMyGroups` đếm cả thành viên đã rời nhóm

**Mức độ**: 🟡 **[important]**

Tại `src/services/group.service.ts` dòng 77-81, đếm số thành viên không lọc `left_at IS NULL`:

```ts
const { data: counts } = await supabase
  .from('group_members')
  .select('group_id')
  .in('group_id', groupIds);
  // ← thiếu: .is('left_at', null)
```

Điều này làm tăng số thành viên hiển thị trên màn hình chính với người đã rời nhóm.

### 1.3 `fetchMyGroups` hiện cả nhóm mà user đã rời

**Mức độ**: 🟡 **[important]**

Tại `src/services/group.service.ts` dòng 56-58, truy vấn thành viên không lọc nhóm đã rời:

```ts
const { data: memberships } = await supabase
  .from('group_members')
  .select('group_id')
  .eq('user_id', userId);
  // ← thiếu: .is('left_at', null)
```

User đã rời nhóm vẫn thấy nhóm đó trong danh sách của mình.

### 1.4 Không kiểm tra quyền trong `approveJoinRequest` / `rejectJoinRequest`

**Mức độ**: 🟡 **[important]**

Tại `src/services/group.service.ts` dòng 205-265, `approveJoinRequest` xác minh user đã đăng nhập, nhưng không kiểm tra caller có phải owner/admin của nhóm không. RLS của Supabase có thể bảo vệ, nhưng tầng service không validate — nếu RLS cấu hình sai, bất kỳ user nào cũng có thể duyệt request cho bất kỳ nhóm nào.

Cần thêm kiểm tra role trước khi xử lý, hoặc ghi chú rõ ràng là phụ thuộc hoàn toàn vào RLS.

### 1.5 `removeMember` / `updateMemberRole` — không kiểm tra quyền và không chặn tự xóa

**Mức độ**: 🟡 **[important]**

Tại `src/services/group.service.ts` dòng 366-372, `removeMember` nhận `memberId` mà không kiểm tra caller có quyền không. Ngoài ra, không có guard ngăn owner tự xóa chính mình (sẽ để nhóm không có chủ).

---

## 2. LOGIC VÀ TÍNH ĐÚNG ĐẮN

### 2.1 `splitByRatio` — người cuối có thể nhận số tiền âm

**Mức độ**: 🔴 **[blocking]**

Tại `src/utils/split.ts` dòng 196-210, khi làm tròn đẩy các thành viên trước vượt quá phần công bằng của họ, `remaining` có thể âm, gây ra split âm cho người cuối.

Tuy ít xảy ra với số tiền VND (bội của 1000), guard `validateSplits` ở tầng UI sẽ bắt lỗi này. Tuy nhiên, bản thân hàm nên assert `remaining >= 0` hoặc xử lý một cách an toàn. Bộ test chưa cover trường hợp này.

### 2.2 `calculateSettlements` đọc từ mảng `balances` gốc sau khi biến đổi

**Mức độ**: 🟡 **[important]**

Tại `src/utils/settlement.ts` dòng 59-65, phần điều chỉnh làm tròn đọc lại `balances` để tính `totalDebt`. Vì hàm tạo bản sao nông với `{ ...b }`, mảng gốc không bị thay đổi — logic đúng. Tuy nhiên, ý định dễ vỡ tình cờ — nếu ai refactor dùng trực tiếp object gốc, sẽ hỏng mà không báo lỗi.

### 2.3 `expense.service.ts:calculateBalances` lấy TẤT CẢ thành viên, không chỉ active

**Mức độ**: 🟢 **[nit]**

Tại `src/services/expense.service.ts` dòng 146-149, thành viên được lấy không lọc `left_at IS NULL`. Điều này có thể đúng (thành viên đã rời nhưng còn nợ vẫn nên hiện) nhưng không nhất quán với `fetchGroupMembers`. Cần thêm comment giải thích ý đồ.

---

## 3. RACE CONDITIONS VÀ TOÀN VẸN DỮ LIỆU

### 3.1 `createExpense` — expense + splits không phải atomic

**Mức độ**: 🟡 **[important]**

Tại `src/services/expense.service.ts` dòng 62-98, expense và splits được insert bằng 2 query riêng. Nếu splits insert thất bại, sẽ có expense không có splits — vi phạm BR-02 (tổng splits = tổng số tiền).

Cần xem xét gói trong RPC/function trên Supabase, hoặc ít nhất rollback (xóa expense) nếu insert splits thất bại.

### 3.2 `approveJoinRequest` — TOCTOU race giữa kiểm tra và insert

**Mức độ**: 🟢 **[nit]**

Tại `src/services/group.service.ts` dòng 221-246, kiểm tra rejoin và insert là 2 query riêng. Hai admin duyệt cùng lúc có thể cả hai đều pass kiểm tra — nhưng xử lý lỗi `23505` tại dòng 246 đã giảm thiểu được vấn đề này.

---

## 4. HIỆU NĂNG

### 4.1 `fetchUserBalanceSummary` — lọc O(trips * expenses)

**Mức độ**: 🟢 **[nit]**

Tại `src/services/group.service.ts` dòng 464-467, trong vòng lặp `for (const trip of trips)`, expenses và payments được lọc bằng `.filter()` cho mỗi trip. Với user ở nhiều nhóm và nhiều chuyến, độ phức tạp là O(T * E). Nên nhóm trước theo `trip_id` vào Map để xử lý 1 lượt.

### 4.2 `getAuthUserId()` trùng lặp ở 4 service — 2 Supabase call mỗi lần gọi service

**Mức độ**: 🟡 **[important]**

Cùng hàm `getAuthUserId()` được copy tại:
- `group.service.ts` dòng 502-514
- `expense.service.ts` dòng 179-192
- `payment.service.ts` dòng 89-102
- `trip.service.ts` dòng 67-81

Mỗi lần gọi mất 2 round-trip tới Supabase (`auth.getUser()` + tra bảng `users`). Mỗi service call (tạo expense, tạo payment...) đều tốn thêm 2 request không cần thiết.

Cần trích xuất ra shared module và xem xét cache theo session.

---

## 5. AN TOÀN KIỂU DỮ LIỆU (TYPE SAFETY)

### 5.1 `GroupMemberRow` thiếu trường `left_at`

**Mức độ**: 🟡 **[important]**

Tại `src/types/database.types.ts` dòng 25-32, `GroupMemberRow` không có `left_at`, nhưng schema và service code đều sử dụng:

```ts
export interface GroupMemberRow {
  // ...
  joined_at: string;
  // ← thiếu: left_at: string | null;
}
```

Interface `GroupMember` trong `group.service.ts` đã có `left_at`, nên đây là lệch pha giữa types file và thực tế.

### 5.2 Sử dụng quá nhiều `any` trong `group.service.ts`

**Mức độ**: 🟢 **[nit]**

Tại `src/services/group.service.ts` dòng 465-484, có 7 chỗ dùng `: any` trên kết quả Supabase query. Nên type bằng Supabase generated types hoặc interface rõ ràng.

---

## 6. GIAO DIỆN NGƯỜI DÙNG (UI/UX)

### 6.1 `ErrorBoundary` hardcode dark theme

**Mức độ**: 🟢 **[nit]**

Tại `src/components/common/ErrorBoundary.tsx` dòng 48-49, background hardcode `#0F172A` (tối). User ở light mode sẽ thấy màn hình lỗi tối đột ngột. Class component không dùng hooks được, nhưng có thể dùng `Appearance.getColorScheme()`.

### 6.2 `TripDetailScreen` — ratio preview tính lại mỗi lần render

**Mức độ**: 🟢 **[nit]**

Tại `src/app/(main)/trips/[id].tsx` dòng 297-305, preview chia theo tỷ lệ gọi `splitByRatio()` trong inline function trong JSX cho mỗi dòng thành viên. Sẽ tính toán lại toàn bộ split N lần mỗi render. Nên tính 1 lần rồi tra cứu.

### 6.3 Cài đặt dark mode lưu nhưng không áp dụng

**Mức độ**: 🟡 **[important]**

Tại `src/app/(main)/settings.tsx` dòng 179-199, chế độ tối/sáng được lưu vào Supabase, nhưng app luôn dùng `useColorScheme()` (theo hệ thống) — xem `src/app/_layout.tsx` dòng 43. Cài đặt `dark_mode` của user không bao giờ được đọc để ghi đè mặc định hệ thống.

---

## 7. ĐỘ BAO PHỦ TEST

### 7.1 Những gì được test tốt

- Logic chia tiền (đều + tỷ lệ) — kỹ lưỡng, bao gồm edge cases
- Tính toán số dư — tất cả kịch bản nghiệp vụ từ spec
- Thuật toán quyết toán — đầy đủ edge cases
- Luồng tích hợp đầy đủ: expense → balance → settlement → payment → số dư = 0

### 7.2 Những gì còn thiếu

- Chưa test `splitByRatio` với ratio âm hoặc bằng 0
- Chưa test `splitByRatio` khi làm tròn gây số âm cho người cuối
- Chưa test `validateAmount` với số cực lớn (> `Number.MAX_SAFE_INTEGER`)
- Tầng service chưa có test (dự kiến — cần mock Supabase)
- Store actions chưa có test

---

## 8. KIẾN TRÚC

### 8.1 Quyết định tốt

- Hàm thuần `computeBalances()` trong `src/utils/balance.ts` — dùng chung giữa test và production, tránh lệch pha
- Soft delete ở mọi nơi (`deleted_at`, `left_at`)
- SQLite bật WAL mode + foreign keys
- Supabase auth tokens lưu trong SecureStore (không phải AsyncStorage)
- Thuật toán quyết toán ghi rõ "chỉ là gợi ý" (BR-07)
- Audit log lỗi không làm hỏng luồng chính

### 8.2 Điểm lo ngại

- SQLite local DB tồn tại nhưng sync queue không bao giờ được sử dụng — bảng `sync_queue` được tạo nhưng không gì đọc/ghi vào
- Bảng `join_requests` được tham chiếu trong service code nhưng không có trong schema local (`src/db/schema.ts`) — chỉ tồn tại trên Supabase

---

## Bảng điểm tổng hợp

| Lĩnh vực | Điểm | Ghi chú |
|----------|------|---------|
| **Logic tài chính** | A | Làm tròn, BR-01/02 đều chắc chắn. Test kỹ. |
| **Bảo mật** | C | Lỗ hổng phân quyền, actor_id sai trong audit |
| **Toàn vẹn dữ liệu** | B- | Expense+splits không atomic, đếm thành viên lệch |
| **Hiệu năng** | B | Trùng lặp auth lookup, lọc O(n*m) |
| **An toàn kiểu** | B | Types lệch với schema, dùng nhiều `any` |
| **Chất lượng test** | A- | 71 tests, bao phủ tốt các quy tắc nghiệp vụ |
| **UI/UX** | B+ | Sạch sẽ, nhưng dark mode không hoạt động |
| **Kiến trúc** | A- | Phân tầng rõ, hạ tầng sync chưa dùng |

---

## Danh sách hành động ưu tiên

1. **Sửa `actor_id` trong audit** — blocking, tất cả audit log đang hỏng
2. **Sửa `fetchMyGroups`** — lọc `left_at IS NULL` trong cả truy vấn membership và đếm
3. **Làm expense+splits atomic** — hoặc rollback khi splits thất bại
4. **Kết nối cài đặt dark mode** — hiện tại lưu nhưng không áp dụng
5. **Trích xuất `getAuthUserId()` dùng chung** — biệt trùng và xem xét cache
6. **Thêm `left_at` vào `GroupMemberRow`** type

---

*Báo cáo được tạo bởi Claude Code — 2026-04-15*
