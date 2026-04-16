# Báo cáo Review Code — SplitVN (Fair Pay)

**Codebase**: React Native (Expo 55) + Supabase + Zustand + HeroUI Native + TypeScript strict
**Số file review**: 62 file TypeScript/TSX, ~7.353 dòng code
**Tests**: 3 bộ test, 71 test cases — tất cả PASS
**Ngày review**: 2026-04-16
**Reviewer**: Claude Code (full review)

---

## Đánh giá tổng thể: **Yêu cầu chỉnh sửa (Request Changes)**

Codebase có cấu trúc tốt với phân tầng rõ ràng (utils → services → stores → UI). Logic tài chính được test kỹ lưỡng — 71 test cases bao phủ các quy tắc nghiệp vụ về chia tiền, số dư, và quyết toán. Tuy nhiên, có nhiều vấn đề cần xử lý trước khi ship, đặc biệt về **bảo mật (thiếu kiểm tra quyền)**, **toàn vẹn dữ liệu (thiếu transaction)**, **hiệu năng (trùng lặp auth lookup, thiếu memoization)**, và **tổ chức code (component quá lớn)**.

**Điểm mạnh nổi bật:**
- Hàm thuần (`computeBalances`, `splitEqual`, `calculateSettlements`) được dùng chung giữa test và production
- Soft delete nhất quán (`deleted_at`, `left_at`)
- Auth token lưu trong SecureStore (không phải AsyncStorage)
- Thuật toán quyết toán Greedy xử lý làm tròn chính xác với unrounded tracking
- Audit log lỗi không làm hỏng luồng chính

---

## 1. BẢO MẬT

### 1.1 `audit.service.ts` dùng `auth.id` thay vì `users.id` làm `actor_id`

**Mức độ**: :red_circle: **[blocking]**
**File**: [audit.service.ts:73-84](src/services/audit.service.ts#L73-L84)

Hàm `logAction` ghi `user.id` (Supabase auth UUID) vào trường `actor_id`, nhưng FK `audit_logs.actor_id` tham chiếu đến bảng `users(id)` — là user ID cấp ứng dụng. Mọi service khác đều sử dụng `getAuthUserId()` để chuyển đổi `auth_id → users.id`, nhưng audit bỏ qua bước này.

**Hậu quả**:
- Ràng buộc FK thất bại (audit được bọc trong `try/catch` nên lỗi bị nuốt im lặng)
- `fetchAuditLogs` làm giàu tên actor bằng cách tra `users.id`, nên tất cả log hiện "Ẩn danh"
- Toàn bộ lịch sử audit hiện tại vô nghĩa

**Gợi ý sửa**:
```ts
// Thay vì:
const { data: { user } } = await supabase.auth.getUser();
actor_id: user.id, // ← auth UUID

// Dùng:
const userId = await getAuthUserId(); // ← app user ID
if (!userId) return;
actor_id: userId,
```

---

### 1.2 Không kiểm tra quyền trong các hàm quản lý nhóm

**Mức độ**: :yellow_circle: **[important]**
**File**: [group.service.ts](src/services/group.service.ts)

Nhiều hàm quan trọng không kiểm tra caller có quyền thực hiện hành động không:

| Hàm | Dòng | Vấn đề |
|-----|------|--------|
| `approveJoinRequest()` | 205 | Không kiểm tra caller là owner/admin |
| `rejectJoinRequest()` | 268 | Không kiểm tra caller là owner/admin |
| `updateMemberRole()` | 329 | Không kiểm tra caller là owner |
| `removeMember()` | 366 | Không kiểm tra quyền, không chặn owner tự xóa chính mình |
| `updateGroup()` | 376 | Không kiểm tra caller là admin/owner |
| `deleteGroup()` | 389 | Không kiểm tra caller là owner |
| `fetchPendingJoinRequests()` | 190 | Bất kỳ user nào cũng xem được |

Nếu Supabase RLS cấu hình sai hoặc bị tắt, bất kỳ user nào cũng có thể duyệt request, xóa thành viên, xóa nhóm của người khác.

**Gợi ý**: Thêm guard kiểm tra role ở đầu mỗi hàm, hoặc ghi chú rõ ràng là phụ thuộc hoàn toàn vào RLS + review RLS policies.

---

### 1.3 `fetchMyGroups` hiện cả nhóm mà user đã rời

**Mức độ**: :yellow_circle: **[important]**
**File**: [group.service.ts:56-59](src/services/group.service.ts#L56-L59)

```ts
const { data: memberships } = await supabase
  .from('group_members')
  .select('group_id')
  .eq('user_id', userId);
  // ← thiếu: .is('left_at', null)
```

User đã rời nhóm vẫn thấy nhóm đó trong danh sách của mình.

---

### 1.4 `fetchMyGroups` đếm cả thành viên đã rời nhóm

**Mức độ**: :yellow_circle: **[important]**
**File**: [group.service.ts:77-81](src/services/group.service.ts#L77-L81)

```ts
const { data: counts } = await supabase
  .from('group_members')
  .select('group_id')
  .in('group_id', groupIds);
  // ← thiếu: .is('left_at', null)
```

Số thành viên hiển thị trên màn hình chính bao gồm cả người đã rời nhóm.

---

### 1.5 Không validate biến môi trường

**Mức độ**: :yellow_circle: **[important]**
**File**: [constants.ts:6-7](src/config/constants.ts#L6-L7)

```ts
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
```

Nếu env vars không được set, app sẽ tạo Supabase client với URL rỗng → thất bại im lặng tại runtime với lỗi 401/network không rõ nguyên nhân. Cần throw error sớm nếu thiếu env vars bắt buộc.

---

### 1.6 `SecureStore` adapter không có error handling

**Mức độ**: :green_circle: **[nit]**
**File**: [supabase.ts:6-16](src/config/supabase.ts#L6-L16)

`ExpoSecureStoreAdapter` không bọc try/catch. Nếu SecureStore throw (VD: thiết bị không hỗ trợ), app crash. Nên wrap trong try/catch và fallback an toàn.

---

### 1.7 Không validate input trong các hàm service

**Mức độ**: :yellow_circle: **[important]**

Các hàm service không validate độ dài/nội dung input:

| Hàm | Input thiếu validate |
|-----|---------------------|
| `createGroup()` | Tên nhóm (độ dài, ký tự đặc biệt) |
| `createTrip()` | Tên chuyến (độ dài) |
| `updateDisplayName()` | Chỉ check empty, không check độ dài max |
| `createPayment()` | Không check số tiền âm hoặc = 0 |
| `createExpense()` | Không check số tiền âm |
| `updateFcmToken()` | Không check format token |

---

## 2. LOGIC VÀ TÍNH ĐÚNG ĐẮN

### 2.1 `createExpense` — expense và splits không phải atomic

**Mức độ**: :red_circle: **[blocking]**
**File**: [expense.service.ts:66-96](src/services/expense.service.ts#L66-L96)

Expense và splits được insert bằng 2 query riêng biệt:

```ts
// Query 1: Insert expense
const { data: expense } = await supabase.from('expenses').insert({...});

// Query 2: Insert splits (có thể thất bại)
const { error: splitErr } = await supabase.from('expense_splits').insert(splitRows);
```

Nếu query 2 thất bại, sẽ tồn tại expense không có splits — vi phạm BR-02 (tổng splits = tổng số tiền). App hiện tại throw error nhưng không rollback expense đã insert.

**Gợi ý**: Dùng Supabase RPC/database function để gọi trong 1 transaction, hoặc thêm rollback logic:
```ts
if (splitErr) {
  await supabase.from('expenses').delete().eq('id', expense.id);
  throw splitErr;
}
```

---

### 2.2 `splitByRatio` — người cuối có thể nhận số tiền âm

**Mức độ**: :yellow_circle: **[important]**
**File**: [split.ts:196-210](src/utils/split.ts#L196-L210)

Khi làm tròn đẩy các thành viên trước vượt quá phần công bằng, `remaining` có thể âm, gây split âm cho người cuối. Xảy ra khi các ratio chênh lệch lớn và total nhỏ.

VD: `total = 10000, ratios = [9, 1, 1, 1]` → sum = 12
- Người 1: round(10000*9/12 / 1000)*1000 = 8000
- Người 2: round(10000*1/12 / 1000)*1000 = 1000
- Người 3: round(10000*1/12 / 1000)*1000 = 1000
- remaining = 10000 - 8000 - 1000 - 1000 = 0 (OK trong trường hợp này)

Nhưng VD khác: khi n lớn hơn thì làm tròn có thể tích lũy. Cần thêm assert `remaining >= 0`.

---

### 2.3 `calculateSettlements` — adjustment logic đọc từ mảng gốc

**Mức độ**: :green_circle: **[nit]**
**File**: [settlement.ts:59-65](src/utils/settlement.ts#L59-L65)

Phần điều chỉnh làm tròn đọc lại `balances` gốc để tính `totalDebt`. Vì hàm tạo bản sao nông với `{ ...b }`, mảng gốc không bị thay đổi — logic đúng. Tuy nhiên, ý định dễ vỡ vô tình — nếu ai refactor dùng trực tiếp object gốc, sẽ hỏng mà không báo lỗi.

**Gợi ý**: Thêm comment giải thích tại sao đọc lại `balances` là an toàn, hoặc lưu `totalDebt` trước vòng lặp.

---

### 2.4 `user.service.ts` — double write không atomic

**Mức độ**: :yellow_circle: **[important]**
**File**: [user.service.ts](src/services/user.service.ts)

`updateDisplayName()` cập nhật cả bảng `users` và Supabase auth metadata bằng 2 query riêng. Nếu 1 thành công và 1 thất bại, dữ liệu bị lệch pha giữa hai nguồn.

---

## 3. HIỆU NĂNG

### 3.1 `getAuthUserId()` trùng lặp ở 4 service — 2 Supabase call mỗi lần

**Mức độ**: :yellow_circle: **[important]**
**File**: Xuất hiện tại 4 file:
- [group.service.ts:502-515](src/services/group.service.ts#L502-L515)
- [expense.service.ts:179-192](src/services/expense.service.ts#L179-L192)
- [payment.service.ts:89-102](src/services/payment.service.ts#L89-L102)
- [trip.service.ts:68-81](src/services/trip.service.ts#L68-L81)

Mỗi lần gọi mất 2 round-trip tới Supabase (`auth.getUser()` + tra bảng `users`). Mỗi service call (tạo expense, tạo payment...) đều tốn thêm 2 request không cần thiết.

**Gợi ý**: Trích xuất ra `src/services/auth.helper.ts` và xem xét cache theo session:
```ts
let cachedUserId: string | null = null;
export async function getAuthUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  // ... fetch logic
  cachedUserId = data?.id ?? null;
  return cachedUserId;
}
```

---

### 3.2 `fetchUserBalanceSummary` — lọc O(trips * expenses)

**Mức độ**: :green_circle: **[nit]**
**File**: [group.service.ts:464-467](src/services/group.service.ts#L464-L467)

Trong vòng lặp `for (const trip of trips)`, expenses và payments được lọc bằng `.filter()` cho mỗi trip. Với nhiều nhóm và nhiều chuyến, độ phức tạp là O(T * E).

**Gợi ý**: Nhóm trước theo `trip_id` vào `Map`:
```ts
const expensesByTrip = new Map<string, typeof expenses>();
expenses.forEach(e => {
  const list = expensesByTrip.get(e.trip_id) || [];
  list.push(e);
  expensesByTrip.set(e.trip_id, list);
});
```

---

### 3.3 `calculateBalances` trong expense.service — 4 query tuần tự

**Mức độ**: :green_circle: **[nit]**
**File**: [expense.service.ts:119-151](src/services/expense.service.ts#L119-L151)

4 query Supabase chạy tuần tự (expenses, payments, trip, members). 3 query đầu có thể chạy song song với `Promise.all()` sau khi có `tripId`.

---

### 3.4 `useAppTheme()` gọi `useUniwind()` hai lần

**Mức độ**: :green_circle: **[nit]**
**File**: [useAppTheme.ts](src/hooks/useAppTheme.ts)

`useAppTheme()` gọi `useIsDark()` → gọi `useUniwind()`. Mỗi component dùng cả 2 hook sẽ gọi `useUniwind()` 2 lần mỗi render.

**Gợi ý**: Lưu theme 1 lần:
```ts
export function useAppTheme() {
  const { theme } = useUniwind();
  return theme === 'dark' ? colors.dark : colors.light;
}
```

---

### 3.5 Component quá lớn — thiếu memoization

**Mức độ**: :yellow_circle: **[important]**
**File**:
- [trips/[id].tsx](src/app/(main)/trips/[id].tsx) — ~572 dòng
- [groups/[id].tsx](src/app/(main)/groups/[id].tsx) — ~489 dòng

Các vấn đề chung:
- **FlatList `renderItem`** dùng inline arrow functions — tạo lại mỗi render
- **AnimatedEntrance** wrap mỗi item không có memoization
- **Split calculation** (`splitByRatio()`) gọi trong JSX inline cho mỗi dòng thành viên
- **Style objects** tạo inline mỗi render (VD: `{ backgroundColor: c.background }`)
- **Helper functions** (`getMemberName`, `renderTrip`, `renderMember`) là inline arrow
- **Không có `useMemo`/`useCallback`** bất kỳ đâu

**Gợi ý**: Tách các tab thành component riêng, dùng `React.memo` + `useCallback` cho FlatList items.

---

## 4. AN TOÀN KIỂU DỮ LIỆU (TYPE SAFETY)

### 4.1 `GroupMemberRow` thiếu trường `left_at`

**Mức độ**: :yellow_circle: **[important]**
**File**: [database.types.ts](src/types/database.types.ts)

`GroupMemberRow` không có `left_at`, nhưng schema và service code đều sử dụng. Interface `GroupMember` trong `group.service.ts` đã có `left_at` — lệch pha giữa types file và thực tế.

---

### 4.2 Sử dụng quá nhiều `any` trong services

**Mức độ**: :yellow_circle: **[important]**

| File | Số lượng `any` | Vị trí |
|------|---------------|--------|
| [group.service.ts](src/services/group.service.ts) | 8 | Dòng 465-484 (filter/map callbacks) |
| [expense.service.ts](src/services/expense.service.ts) | 3 | Dòng 154, 157, 163 |
| [audit.service.ts](src/services/audit.service.ts) | 4 | Dòng 10-11 (interface), 43, 52 |

**Gợi ý**: Dùng Supabase generated types hoặc định nghĩa interface rõ ràng cho Supabase responses.

---

### 4.3 `group.store.ts` — giả định `members[0]` tồn tại

**Mức độ**: :yellow_circle: **[important]**
**File**: [group.store.ts:104-107](src/stores/group.store.ts#L104-L107)

```ts
changeRole: async (memberId, role) => {
  await updateMemberRole(memberId, role);
  const members = get().currentGroupMembers;
  if (members.length > 0) {
    await get().loadMembers(members[0]!.group_id); // ← non-null assertion
  }
}
```

Dùng `!` assertion nhưng điều kiện `length > 0` đảm bảo an toàn. Tuy nhiên, nên truyền `groupId` trực tiếp từ caller để tránh phụ thuộc vào state:

```ts
changeRole: async (memberId, role, groupId) => {
  await updateMemberRole(memberId, role);
  await get().loadMembers(groupId);
}
```

---

### 4.4 `trip.store.ts` — `result?.id || 'unknown'` mất expense ID

**Mức độ**: :green_circle: **[nit]**
**File**: [trip.store.ts:129](src/stores/trip.store.ts#L129)

```ts
targetId: result?.id || 'unknown',
```

Nếu `createExpense` trả về null (không nên xảy ra vì sẽ throw trước), audit log ghi `'unknown'` — không trace được. Nên dùng optional chaining hoặc throw nếu thiếu ID.

---

### 4.5 `ExpenseRow.paid_by` — comment sai

**Mức độ**: :green_circle: **[nit]**
**File**: [database.types.ts](src/types/database.types.ts)

Comment ghi "JSON array of member IDs" nhưng thực tế là single member ID (string). Service code xác nhận: `paid_by: params.paidByMemberId`. Comment gây nhầm lẫn.

---

## 5. GIAO DIỆN NGƯỜI DÙNG (UI/UX)

### 5.1 `ErrorBoundary` hardcode dark theme

**Mức độ**: :green_circle: **[nit]**
**File**: [ErrorBoundary.tsx](src/components/common/ErrorBoundary.tsx)

Background hardcode `#0F172A` (tối). User ở light mode sẽ thấy màn hình lỗi tối đột ngột. Class component không dùng hooks được — có thể dùng `Appearance.getColorScheme()`.

---

### 5.2 Thiếu accessibility labels

**Mức độ**: :yellow_circle: **[important]**

| Màn hình | Vấn đề |
|----------|--------|
| [trips/[id].tsx](src/app/(main)/trips/[id].tsx) | TextInput cho split không có labels, chỉ có placeholder |
| [login.tsx](src/app/(auth)/login.tsx) | Form fields không có `accessibilityLabel` |
| [register.tsx](src/app/(auth)/register.tsx) | Không có email format validation, thiếu confirm password |
| [groups/[id].tsx](src/app/(main)/groups/[id].tsx) | Hit slop không nhất quán giữa các button |

**Điểm tốt**: `OfflineBanner` có `accessibilityRole="alert"` và `accessibilityLiveRegion="polite"`.

---

### 5.3 Form validation yếu

**Mức độ**: :yellow_circle: **[important]**

| Form | Thiếu |
|------|-------|
| Register | Không check email format (regex), không có confirm password |
| Login | Chỉ check presence, không validate email format |
| Create trip | Không check độ dài tên |
| Create group | Không check độ dài tên |
| Add expense | Không validate amount ở tầng UI (chỉ validate ở utils) |

---

### 5.4 SettingsSheet — dark mode hoạt động với optimistic update

**Mức độ**: :star: **[praise]**

[SettingsSheet.tsx](src/components/common/SettingsSheet.tsx) implement dark mode toggle với **optimistic update** + **rollback on error** — UX rất tốt. Cho dù backend thất bại, theme vẫn được áp dụng local.

---

## 6. ĐỘ BAO PHỦ TEST

### 6.1 Những gì được test tốt :white_check_mark:

| Module | Số tests | Bao phủ |
|--------|----------|---------|
| `split.ts` (equal + ratio) | ~40 | Kỹ lưỡng, bao gồm edge cases, explanation |
| `balance.ts` | ~15 | Tất cả kịch bản nghiệp vụ từ spec |
| `settlement.ts` | ~16 | Đầy đủ edge cases, tolerance, real scenarios |
| Tích hợp (expense → balance → settlement → payment) | 2 | Luồng đầy đủ |

### 6.2 Những gì còn thiếu :x:

- `splitByRatio` với ratio âm hoặc bằng 0 — không có test
- `splitByRatio` khi làm tròn gây số âm cho người cuối — không có test
- `validateAmount` với số cực lớn (> `Number.MAX_SAFE_INTEGER`) — không có test
- `calculateSettlements` adjustment logic với real rounding divergence — không có test
- Tầng service chưa có test (cần mock Supabase)
- Store actions chưa có test
- Component/screen chưa có test

---

## 7. KIẾN TRÚC

### 7.1 Quyết định tốt :star: [praise]

- **Hàm thuần** `computeBalances()` trong `utils/balance.ts` — dùng chung giữa test và production, tránh lệch pha
- **Soft delete** nhất quán ở mọi nơi (`deleted_at`, `left_at`)
- **SQLite WAL mode** + foreign keys enabled
- **Supabase auth tokens** lưu trong SecureStore (bảo mật)
- **Settlement algorithm** ghi rõ "chỉ là gợi ý" (BR-07)
- **Audit log** thất bại không làm hỏng luồng chính (try/catch im lặng)
- **Zustand stores** — nhẹ, ít boilerplate, tách biệt rõ giữa domain
- **Phân tầng** utils → services → stores → UI rõ ràng
- **TypeScript strict mode** với `noUncheckedIndexedAccess`, `noUnusedLocals`
- **Promise.all** cho song song queries trong `fetchUserBalanceSummary`

### 7.2 Điểm lo ngại

| Vấn đề | Chi tiết |
|--------|----------|
| **Sync queue không sử dụng** | Bảng `sync_queue` được tạo trong schema nhưng không gì đọc/ghi vào |
| **`join_requests` chỉ trên Supabase** | Không có trong schema local (`src/db/schema.ts`) — offline sẽ không hoạt động |
| **Không có centralized error handling** | Mỗi component tự bắt lỗi riêng, không có error logging/reporting |
| **Không có error state trong stores** | Tất cả lỗi được throw, UI không có cách biết lỗi gì đã xảy ra |
| **Component quá lớn** | `trips/[id].tsx` (572 dòng), `groups/[id].tsx` (489 dòng) — cần tách thành sub-components |
| **Không có retry logic** | Network errors không được retry, không có timeout handling |

---

## 8. DATABASE

### 8.1 Thiếu indexes quan trọng

**Mức độ**: :green_circle: **[nit]**
**File**: [schema.ts](src/db/schema.ts)

| Index thiếu | Lý do cần thiết |
|------------|-----------------|
| `expense_splits.member_id` | Common join khi tính balance |
| `audit_logs.actor_id` | Enrich tên actor trong fetchAuditLogs |
| `payments.trip_id` nói riêng | Filter payments theo trip |

### 8.2 Migration framework — chưa có rollback

**Mức độ**: :green_circle: **[nit]**
**File**: [migrations.ts](src/db/migrations.ts)

Migration array hiện tại rỗng (chưa cần). Nhưng framework không có:
- Transaction wrapping (nếu migration thất bại giữa chừng, DB ở trạng thái không nhất quán)
- Rollback capability
- Data validation sau migration

---

## Bảng điểm tổng hợp

| Lĩnh vực | Điểm | Ghi chú |
|----------|------|---------|
| **Logic tài chính** | **A** | Làm tròn, BR-01/02 đều chắc chắn. 71 test cases. |
| **Bảo mật** | **C** | Lỗ hổng phân quyền nghiêm trọng ở tầng service, actor_id sai trong audit |
| **Toàn vẹn dữ liệu** | **B-** | Expense+splits không atomic, đếm thành viên lệch, double write không atomic |
| **Hiệu năng** | **B-** | Trùng lặp auth lookup (8 round-trip/action), thiếu memoization UI, O(T*E) filtering |
| **An toàn kiểu** | **B** | Types lệch với schema, 15+ chỗ dùng `any`, thiếu discriminated unions |
| **Chất lượng test** | **A-** | 71 tests bao phủ tốt logic nghiệp vụ. Thiếu service/store/component tests. |
| **UI/UX** | **B+** | Sạch sẽ, optimistic dark mode, nhưng thiếu accessibility và form validation |
| **Kiến trúc** | **A-** | Phân tầng rõ, offline infra chưa dùng, component quá lớn |
| **Tổng** | **B** | Nền tảng tốt, cần xử lý bảo mật và data integrity trước khi ship |

---

## Danh sách hành động ưu tiên

### :red_circle: Blocking (phải sửa trước khi merge)

1. **Sửa `actor_id` trong audit** — [audit.service.ts:73-84](src/services/audit.service.ts#L73-L84) — dùng `getAuthUserId()` thay vì `user.id`
2. **Làm expense+splits atomic** — [expense.service.ts:66-96](src/services/expense.service.ts#L66-L96) — dùng RPC hoặc rollback

### :yellow_circle: Important (nên sửa trong sprint này)

3. **Sửa `fetchMyGroups`** — [group.service.ts:56-59](src/services/group.service.ts#L56-L59) — lọc `left_at IS NULL` trong cả 2 query
4. **Thêm kiểm tra quyền** — [group.service.ts](src/services/group.service.ts) — guard role trước approve/reject/remove/updateRole/delete
5. **Trích xuất `getAuthUserId()` dùng chung** — 4 bản sao → 1 shared module với cache
6. **Thêm `left_at` vào `GroupMemberRow`** — [database.types.ts](src/types/database.types.ts)
7. **Validate input** — thêm độ dài/format check cho tên nhóm, tên chuyến, email, số tiền
8. **Tách component lớn** — trips/[id].tsx và groups/[id].tsx thành sub-components với memoization
9. **Validate env vars** — [constants.ts](src/config/constants.ts) — throw nếu thiếu `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY`

### :green_circle: Nit (nice to have)

10. Thêm `assert remaining >= 0` trong `splitByRatio()`
11. Nhóm expenses/payments vào Map trước khi loop trong `fetchUserBalanceSummary()`
12. Thêm accessibility labels cho form inputs
13. Fix `useAppTheme()` gọi `useUniwind()` 2 lần
14. Thêm indexes cho `expense_splits.member_id`, `audit_logs.actor_id`
15. Loại bỏ `any` casts trong services — thay bằng typed interfaces

---

*Báo cáo được tạo bởi Claude Code — 2026-04-16*
