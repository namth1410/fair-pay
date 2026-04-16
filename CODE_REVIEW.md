# Code Review — Fair Pay (SplitVN)

> **Ngày review:** 2026-04-16
> **Phạm vi:** Toàn bộ codebase (`src/` — 76 files TypeScript/TSX)
> **Stack:** Expo 55 · React Native 0.83 · Supabase · Zustand 5 · HeroUI Native
> **Trạng thái CI:** 74/74 tests pass · `tsc --noEmit` clean

---

## Mục lục

1. [Tổng quan & Đánh giá chung](#1-tổng-quan--đánh-giá-chung)
2. [Kiến trúc & Thiết kế](#2-kiến-trúc--thiết-kế)
3. [Bảo mật & Phân quyền](#3-bảo-mật--phân-quyền)
4. [Logic nghiệp vụ & Tính đúng đắn](#4-logic-nghiệp-vụ--tính-đúng-đắn)
5. [Service Layer](#5-service-layer)
6. [Store Layer (Zustand)](#6-store-layer-zustand)
7. [Component Layer](#7-component-layer)
8. [Screen / Routing](#8-screen--routing)
9. [Hiệu năng](#9-hiệu-năng)
10. [Test Coverage](#10-test-coverage)
11. [Bảng điểm tổng hợp](#11-bảng-điểm-tổng-hợp)
12. [Danh sách hành động ưu tiên](#12-danh-sách-hành-động-ưu-tiên)

---

## 1. Tổng quan & Đánh giá chung

Fair Pay là một ứng dụng chia tiền nhóm được thiết kế tốt với kiến trúc phân tầng rõ ràng: **Services → Stores → Components**. Business logic core (balance, split, settlement) được tách thành pure functions có test coverage cao. Codebase tuân thủ phần lớn quy tắc trong CLAUDE.md.

**Điểm mạnh nổi bật:**
- 🎉 `[praise]` Pure functions cho tính toán tài chính — testable, không side-effect
- 🎉 `[praise]` Auth helper cache 30s giảm round-trip hiệu quả
- 🎉 `[praise]` Audit logging tách biệt, failure-safe (không break main flow)
- 🎉 `[praise]` UI components tách nhỏ với React.memo, nhận data qua props
- 🎉 `[praise]` Error mapping sang tiếng Việt thân thiện, không leak thông tin kỹ thuật
- 🎉 `[praise]` Rollback pattern trong `createExpense` đảm bảo BR-02 invariant

**Vấn đề cần xử lý:** 3 blocking, 6 important, 7 nit/suggestion

---

## 2. Kiến trúc & Thiết kế

### 🎉 `[praise]` Phân tầng rõ ràng

```
UI (screens/components) → Stores (Zustand) → Services (Supabase) → Utils (pure)
```

- Services chỉ gọi Supabase và trả typed data
- Stores gọi services và quản lý state
- Utils là hàm thuần, không phụ thuộc runtime
- Components nhận data qua props, không gọi store trực tiếp (trừ common/)

### 🎉 `[praise]` Theme system

`useAppTheme()` là single hook trả về `{ isDark, ...colors }`. Mọi component dùng nhất quán, không ai dùng `useIsDark()` (deprecated). Ternary `scheme === 'dark' ? X : Y` thay vì dùng `Appearance.getColorScheme()` làm key — đúng theo CLAUDE.md.

### 💡 `[suggestion]` Barrel exports

`src/components/ui/index.ts` export tất cả UI components — thuận tiện cho import. Tuy nhiên `src/services/` và `src/utils/` chưa có barrel file. Nên thêm nếu muốn nhất quán, nhưng không bắt buộc vì mỗi file đủ nhỏ.

---

## 3. Bảo mật & Phân quyền

### 🔴 `[blocking]` SEC-01: Thiếu `assertRole()` trong trip.service.ts

**File:** `src/services/trip.service.ts` — `createTrip()` (L32), `closeTrip()` (L54), `reopenTrip()` (L64)

CLAUDE.md quy định: _"Mọi hàm service thay đổi dữ liệu nhóm PHẢI gọi `assertRole()` ở đầu hàm"_. Cả 3 hàm đều thiếu kiểm tra quyền. Bất kỳ authenticated user nào có `groupId` đều có thể tạo/đóng/mở trip.

```typescript
// trip.service.ts — hiện tại
export async function createTrip(groupId: string, name: string, ...) {
  // ❌ Không có assertRole()
  const userId = await getAuthUserId();
  ...
}

// Nên sửa
export async function createTrip(groupId: string, name: string, ...) {
  await assertRole(groupId, ['owner', 'admin']); // ✅
  const userId = await getAuthUserId();
  ...
}
```

**Ảnh hưởng:** Member thường có thể tạo/đóng/mở lại trip mà không cần quyền admin.

> **Lưu ý:** RLS trên Supabase có thể đã chặn ở tầng database, nhưng defense-in-depth yêu cầu kiểm tra ở cả application layer.

### 🔴 `[blocking]` SEC-02: Thiếu `assertRole()` trong expense.service.ts và payment.service.ts

**Files:**
- `src/services/expense.service.ts` — `deleteExpense()` (L114)
- `src/services/payment.service.ts` — `deletePayment()` (L82)

Hai hàm delete chỉ cần `expenseId`/`paymentId` — không kiểm tra caller có thuộc nhóm không, có quyền xóa không. Bất kỳ authenticated user nào biết ID đều có thể soft-delete.

```typescript
// Hiện tại — không kiểm tra quyền
export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId);
  if (error) throw error;
}
```

**Đề xuất:** Fetch expense trước, lấy `group_id`, rồi `assertRole(groupId, ['owner', 'admin'])`.

### 🟡 `[important]` SEC-03: Google OAuth token parsing fragile

**File:** `src/stores/auth.store.ts` (L100-114)

```typescript
const params = new URLSearchParams(url.split('#')[1]);
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');
```

Nếu URL redirect không chứa fragment `#` (ví dụ error redirect, hoặc deep link format thay đổi), `url.split('#')[1]` trả về `undefined`, `URLSearchParams(undefined)` sẽ tạo empty params → silent failure, user không nhận được session mà không có error message.

**Đề xuất:** Thêm validation:
```typescript
const fragment = url.split('#')[1];
if (!fragment) throw new Error('Đăng nhập Google thất bại — không nhận được token');
const params = new URLSearchParams(fragment);
```

### 🟢 `[nit]` SEC-04: `__DEV__` check trong production build

**File:** `src/services/user.service.ts` (L38)

```typescript
if (error && __DEV__) {
  console.warn('[fetchCurrentUser] users table query failed:', error.message);
}
```

Không gây lỗi nhưng lỗi bị nuốt hoàn toàn trong production. Nên log qua crash reporting service (nếu có) thay vì chỉ console.warn trong dev.

---

## 4. Logic nghiệp vụ & Tính đúng đắn

### 🎉 `[praise]` Thuật toán tài chính chính xác

- `computeBalances()` — Σ balance luôn = 0, verified bởi 15+ test cases (TC-05)
- `splitEqual()` — Round 1000đ, last person absorbs remainder, fallback 1đ cho small amounts
- `splitByRatio()` — Clamp `Math.max(0, remaining)` ngăn negative splits
- `calculateSettlements()` — Greedy ≤ N-1 transactions, adjustment cho rounding diff

### 🟡 `[important]` BIZ-01: `splitByRatio` clamp có thể vi phạm BR-02

**File:** `src/utils/split.ts` (L203)

```typescript
splits.push({ memberId: member.memberId, amount: Math.max(0, remaining) });
```

Khi nhiều members round UP, `remaining` có thể âm → clamp về 0 → **tổng splits < total amount**. Điều này vi phạm BR-02 (_"total splits must equal expense amount"_).

**Kịch bản:** 7000đ chia ratio [1,1,1,1,1,1,1] — mỗi người round lên 1000đ = 6000đ đã phân phối, remaining = 1000đ → OK trong trường hợp này. Nhưng với ratio [3,3,3,3,3,3,1] / 10000đ, accumulated rounding có thể vượt tolerance.

**Mức độ:** Thực tế khó xảy ra vì `validateSplits()` được gọi trước `createExpense()` — form sẽ reject splits không hợp lệ. Nhưng hàm `splitByRatio` đơn lẻ không đảm bảo invariant.

**Đề xuất:** Thêm test case cho edge case này hoặc điều chỉnh rounding strategy (round DOWN thay vì NEAREST cho non-last members).

### 🟡 `[important]` BIZ-02: Settlement adjustment bỏ qua nếu diff > TOLERANCE

**File:** `src/utils/settlement.ts` (L70)

```typescript
if (diff !== 0 && Math.abs(diff) <= TOLERANCE) {
  const last = transactions[transactions.length - 1]!;
  const adjusted = last.amount + diff;
  if (adjusted > 0) last.amount = adjusted;
}
```

Nếu `|diff| > 1000đ` (ví dụ 10+ người với nhiều khoản nhỏ), adjustment bị bỏ qua hoàn toàn → total settlement ≠ total debt. Settlement chỉ là "gợi ý" (BR-07), nhưng sai lệch lớn gây mất tin tưởng.

**Đề xuất:** Log warning khi `|diff| > TOLERANCE`, hoặc phân bổ diff cho nhiều transactions thay vì chỉ transaction cuối.

### 🟢 `[nit]` BIZ-03: `computeBalances` dùng `balanceMap[m.id] || 0`

**File:** `src/utils/balance.ts` (L77)

`|| 0` sẽ thay thế cả giá trị `0` hợp lệ bằng `0` (không sai), nhưng nếu map có member với balance `NaN` hoặc `undefined` do lỗi upstream, `|| 0` sẽ mask lỗi thay vì fail fast. Dùng `?? 0` chính xác hơn về semantic.

---

## 5. Service Layer

### 🎉 `[praise]` Rollback pattern trong expense.service.ts

```typescript
// L100-108
const { error: splitErr } = await supabase
  .from('expense_splits').insert(splitRows);

if (splitErr) {
  await supabase.from('expenses').delete().eq('id', expense.id);
  throw splitErr;
}
```

Đảm bảo BR-02: không bao giờ có expense orphan không có splits.

### 🟡 `[important]` SVC-01: `calculateBalances` thiếu `left_at` filter

**File:** `src/services/expense.service.ts` (L157-160)

```typescript
const { data: members } = await supabase
  .from('group_members')
  .select('id, display_name')
  .eq('group_id', tripRes.data.group_id);
// ❌ Thiếu .is('left_at', null)
```

CLAUDE.md: _"Mọi query liên quan `group_members` PHẢI có `.is('left_at', null)` trừ khi cần hiển thị lịch sử."_

Ở đây có thể **cố ý** include members đã rời (để balance của họ vẫn được tính), nhưng cần comment giải thích rõ tại sao bỏ filter. So sánh: `fetchUserBalanceSummary()` (group.service.ts L464) **có** `.is('left_at', null)` → inconsistent behavior giữa hai hàm cùng tính balance.

**Ảnh hưởng:** Nếu member A rời nhóm nhưng có expense, `calculateBalances` vẫn tính balance cho A (đúng), nhưng `fetchUserBalanceSummary` thì không (sai). Kết quả: số dư hiển thị ở Trip detail khác với số dư ở Home screen.

### 🟡 `[important]` SVC-02: `user.service.ts` dùng `auth.id` thay vì `users.id`

**File:** `src/services/user.service.ts` (L51)

```typescript
return {
  id: user.id,  // ← Supabase auth UUID
  ...
};
```

`fetchCurrentUser()` trả về `id: user.id` — đây là **auth UUID**, không phải **app-level user ID** (từ bảng `users`). Nếu caller dùng `id` này để so sánh với `group_members.user_id` (app-level), kết quả sẽ sai.

Hiện tại chỉ `SettingsSheet` gọi hàm này và dùng `display_name`/`email` nên chưa gây bug trực tiếp. Nhưng nếu có ai dùng `.id` từ kết quả, đây sẽ là bug khó debug.

### 💡 `[suggestion]` SVC-03: `assertRole` nên là shared helper

`assertRole()` hiện chỉ là private function trong `group.service.ts`. Các service khác (trip, expense, payment) nếu cần dùng sẽ phải import hoặc copy. Nên export và đặt trong `auth.helper.ts` hoặc tạo `authorization.helper.ts`.

---

## 6. Store Layer (Zustand)

### 🎉 `[praise]` Thiết kế store tốt

- 4 domain stores phân tách rõ ràng
- `get()` pattern cho cascading updates sau mutation
- `Promise.all()` cho queries độc lập
- Audit logging integration trong trip.store

### 🔴 `[blocking]` STORE-01: Unhandled promise rejection trong confirm callbacks

**File:** `src/app/(main)/groups/[id].tsx` (L123, L134, L145, L157, L167)

```typescript
onConfirm: () => changeRole(member.id, newRole, id),
onConfirm: () => kickMember(member.id, id!),
onConfirm: () => approveRequest(req.id, id!),
onConfirm: () => rejectRequest(req.id, id!),
onConfirm: async () => {
  await removeGroup(id!);
  router.back();
},
```

Các callbacks này gọi async store methods nhưng **không có try/catch**. Nếu service throw (network error, RLS violation), đây là unhandled promise rejection → crash trên React Native production.

Chỉ `removeGroup` (L167) dùng `async/await` nhưng vẫn thiếu try/catch. Các callback khác return Promise nhưng không await → rejection bị nuốt.

**Đề xuất:** Wrap mỗi callback trong try/catch với toast error:
```typescript
onConfirm: async () => {
  try {
    await changeRole(member.id, newRole, id);
    toast.show({ variant: 'success', label: 'Đã thay đổi vai trò' });
  } catch (e) {
    toast.show({ variant: 'danger', label: 'Lỗi', description: getErrorMessage(e) });
  }
},
```

### 🟢 `[nit]` STORE-02: `loadBalances` gọi 2 lần sau mỗi mutation

**File:** `src/stores/trip.store.ts`

Sau `addExpense` (L132-133):
```typescript
await get().loadExpenses(params.tripId);
await get().loadBalances(params.tripId);  // loadBalances đã fetch expenses lại
```

`loadBalances → calculateBalances` fetch expenses từ Supabase một lần nữa. Tổng cộng: 2 lần fetch expenses cho mỗi mutation. Chấp nhận được cho simplicity nhưng có thể optimize bằng cách truyền cached expenses vào `calculateBalances`.

---

## 7. Component Layer

### 🎉 `[praise]` React.memo áp dụng đúng chỗ

Tất cả tab components (BalancesTab, ExpensesTab, SettlementTab, HistoryTab, GroupSettingsTab, MembersTab, TripsTab) đều dùng `React.memo` và nhận data qua props — đúng theo CLAUDE.md.

### 🎉 `[praise]` ExpenseFormSheet — validation kỹ lưỡng

- Step 1: validate title, amount (BR-01), paidBy
- Step 2: validate splits (BR-02) trước khi submit
- Ratio/custom split preview real-time
- Error handling với `getErrorMessage()`
- Busy state prevent double-submit

### 🟡 `[important]` COMP-01: ErrorBoundary hook trong try/catch

**File:** `src/components/common/ErrorBoundary.tsx` (L32-39)

```typescript
function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  let c: ReturnType<typeof useAppTheme> | null = null;
  try {
    c = useAppTheme();
  } catch {
    // Theme context not available
  }
```

Hook `useAppTheme()` được gọi bên trong try/catch. Technically, hook **vẫn được gọi mỗi render** (không vi phạm Rules of Hooks), nhưng nếu hook throw ở lần render thứ 2 mà không throw ở lần render thứ 1, React có thể detect inconsistency.

**Rủi ro:** Thấp — vì `useAppTheme` chỉ gọi `useUniwind()` và spread colors, ít khi throw. Fallback colors đã handle đúng. Nhưng pattern này không idiomatic.

**Đề xuất:** Tách thành 2 components:
```typescript
function ErrorFallbackWithTheme(props) {
  const c = useAppTheme();
  return <ErrorFallbackInner {...props} colors={c} />;
}

function ErrorFallback(props) {
  return (
    <ErrorBoundaryForTheme fallback={<MinimalFallback {...props} />}>
      <ErrorFallbackWithTheme {...props} />
    </ErrorBoundaryForTheme>
  );
}
```

### 🟡 `[important]` COMP-02: ExpenseFormSheet ratio preview recalculates mỗi render

**File:** `src/components/trip/ExpenseFormSheet.tsx` (L296-305)

```typescript
value={
  splitByRatio(
    amount,
    members.map((mm) => ({
      memberId: mm.id,
      ratio: parseInt(ratios[mm.id] || '1', 10) || 1,
    })),
  ).find((s) => s.memberId === m.id)?.amount ?? 0
}
```

`splitByRatio()` được gọi **N lần** (1 lần cho mỗi member) trong mỗi render. Với 10 members, đó là 10 lần chạy full split algorithm mỗi keystroke.

**Đề xuất:** Memoize kết quả:
```typescript
const ratioPreview = useMemo(
  () => splitByRatio(amount, members.map(mm => ({
    memberId: mm.id,
    ratio: parseInt(ratios[mm.id] || '1', 10) || 1,
  }))),
  [amount, members, ratios]
);
// Trong JSX:
value={ratioPreview.find(s => s.memberId === m.id)?.amount ?? 0}
```

### 🟢 `[nit]` COMP-03: `SettlementTab` dùng array index làm key

**File:** `src/components/trip/SettlementTab.tsx` (L98)

```typescript
{settlements.map((s, i) => (
  <AppCard key={i} ... />
))}
```

Settlement items có thể thay đổi thứ tự khi balance thay đổi. Dùng `key={`${s.from}-${s.to}`}` sẽ giúp React reconcile đúng hơn.

### 🟢 `[nit]` COMP-04: ConfirmDialog `onDeletePayment` không await

**File:** `src/components/trip/SettlementTab.tsx` (L174-176)

```typescript
onConfirm={() => {
  if (deleteTarget) onDeletePayment(deleteTarget.id, tripId);
}}
```

`onDeletePayment` là async nhưng không được await → unhandled rejection nếu throw. Tương tự vấn đề STORE-01.

---

## 8. Screen / Routing

### 🎉 `[praise]` AuthGate pattern

`_layout.tsx` implement auth guard đúng cách: check `isInitialized` trước khi redirect, `LoadingScreen` trong khi chờ, redirect loop prevention.

### 🟡 `[important]` SCREEN-01: Role lookup query không hiệu quả

**File:** `src/app/(main)/groups/[id].tsx` (L71-82)

```typescript
const findMyRole = async () => {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single();
  if (data) {
    const me = currentGroupMembers.find((m) => m.user_id === data.id);
    if (me) setMyRole(me.role as Role);
  }
};
```

Mỗi lần `currentGroupMembers` thay đổi, screen query Supabase `users` table để translate auth UUID → app ID. Nên dùng `getAuthUserId()` từ `auth.helper.ts` (đã có 30s cache):

```typescript
import { getAuthUserId } from '../../../services/auth.helper';

const findMyRole = async () => {
  const userId = await getAuthUserId(); // ← cached, no extra query
  if (userId) {
    const me = currentGroupMembers.find((m) => m.user_id === userId);
    if (me) setMyRole(me.role as Role);
  }
};
```

### 🟢 `[nit]` SCREEN-02: Non-null assertions `tripId!`

**File:** `src/app/(main)/trips/[id].tsx` (L76, 77, 98)

```typescript
tripId={tripId!}
groupId={trip?.group_id || ''}
```

`useLocalSearchParams` có thể trả undefined. Dùng `!` assert nguy hiểm. Nên thêm early return:
```typescript
if (!tripId) return <EmptyState title="Không tìm thấy chuyến đi" />;
```

### 🟢 `[nit]` SCREEN-03: `fetchAuditLogs` catch trống

**File:** `src/app/(main)/trips/[id].tsx` (L49)

```typescript
fetchAuditLogs(tripId).then(setAuditLogs).catch(() => {});
```

Lỗi bị nuốt hoàn toàn. Nên ít nhất log:
```typescript
.catch((err) => console.warn('[Audit]', err));
```

---

## 9. Hiệu năng

### 🎉 `[praise]` Query optimization

- `Promise.all()` cho queries độc lập (`fetchMyGroups`, `calculateBalances`, `fetchUserBalanceSummary`)
- `Map` pre-index thay vì `.filter()` trong vòng lặp (`fetchUserBalanceSummary` L492-512)
- WAL mode cho SQLite concurrent reads
- Auth cache 30s giảm round-trip

### 💡 `[suggestion]` PERF-01: Batch data loading trong TripDetailScreen

**File:** `src/app/(main)/trips/[id].tsx` (L44-49)

```typescript
loadExpenses(tripId);
loadPayments(tripId);
loadBalances(tripId);
fetchAuditLogs(tripId).then(setAuditLogs).catch(() => {});
```

4 async calls fire cùng lúc (tốt — không sequential), nhưng `loadBalances` sẽ fetch expenses + payments lại từ Supabase (trùng với `loadExpenses` và `loadPayments`). Tổng cộng: expenses fetched 2 lần, payments fetched 2 lần.

**Đề xuất:** Refactor `loadBalances` nhận cached data thay vì self-fetch, hoặc merge `loadExpenses` + `loadPayments` + `loadBalances` thành 1 call.

### 💡 `[suggestion]` PERF-02: FlatList trong ScrollShadow

**File:** `src/app/(main)/index.tsx` (L198-199)

```typescript
<ScrollShadow LinearGradientComponent={LinearGradient}>
  <FlatList data={groups} ... />
</ScrollShadow>
```

`FlatList` bên trong `ScrollShadow` (which wraps `ScrollView`) có thể gây "VirtualizedList inside ScrollView" warning. FlatList cần control own scrolling để virtualize properly.

---

## 10. Test Coverage

### 🎉 `[praise]` Test architecture

- 74 test cases cover all BR rules (BR-01 → BR-07) và TC scenarios (TC-01 → TC-05)
- Tests import trực tiếp từ utils — **zero drift** giữa test và production code
- Real-world scenario "Đà Lạt 5 người" test end-to-end flow
- Integration tests: Expense → Balance → Settlement → Payment → Verified

### 🟡 `[important]` TEST-01: Thiếu test cho service layer

Hiện tại chỉ test pure functions (utils). Service layer (7 files) không có unit test. Đặc biệt:
- Authorization logic (`assertRole`) chưa được test
- Rollback pattern (`createExpense` split failure) chưa được test
- Race condition handling (`approveJoinRequest` duplicate key) chưa được test

**Đề xuất:** Thêm integration tests với Supabase mock hoặc test database cho critical service functions.

### 🟢 `[nit]` TEST-02: Chưa test `splitByRatio` với small amounts

`splitEqual` có test cho small amounts (1000đ / 3 người), nhưng `splitByRatio` chưa có. Nên thêm: `splitByRatio(1000, [{id:'a', ratio:2}, {id:'b', ratio:1}])`.

---

## 11. Bảng điểm tổng hợp

| Tiêu chí | Điểm | Ghi chú |
|---|---|---|
| **Kiến trúc** | 9/10 | Phân tầng rõ, separation of concerns tốt |
| **Bảo mật** | 6/10 | Thiếu assertRole ở trip/expense/payment service |
| **Logic nghiệp vụ** | 8.5/10 | Thuật toán chính xác, edge case nhỏ ở ratio split |
| **TypeScript** | 8/10 | Không dùng `:any`, typed interfaces đầy đủ. Vài chỗ dùng `as` cast |
| **Component quality** | 8.5/10 | React.memo đúng chỗ, props-driven, accessibility labels |
| **Error handling** | 7/10 | Service layer tốt, nhưng store/screen layer thiếu catch |
| **Performance** | 8/10 | Parallel queries, Map indexing; trùng fetch ở balance |
| **Test coverage** | 7.5/10 | Pure functions excellent; service layer chưa có test |
| **CLAUDE.md compliance** | 8/10 | Đa số tuân thủ; vài quy tắc bị bỏ sót |
| **Tổng** | **7.9/10** | Codebase chất lượng tốt, cần fix security gaps |

---

## 12. Danh sách hành động ưu tiên

### 🔴 Phải sửa trước khi merge (Blocking)

| # | Vấn đề | File | Effort |
|---|---|---|---|
| 1 | SEC-01: Thêm `assertRole()` vào `createTrip`, `closeTrip`, `reopenTrip` | `trip.service.ts` | Nhỏ |
| 2 | SEC-02: Thêm authorization check vào `deleteExpense`, `deletePayment` | `expense.service.ts`, `payment.service.ts` | Nhỏ |
| 3 | STORE-01: Wrap confirm callbacks trong try/catch với toast error | `groups/[id].tsx` | Nhỏ |

### 🟡 Nên sửa (Important)

| # | Vấn đề | File | Effort |
|---|---|---|---|
| 4 | SEC-03: Validate Google OAuth URL fragment | `auth.store.ts` | Nhỏ |
| 5 | SVC-01: Fix `left_at` filter inconsistency giữa 2 balance functions | `expense.service.ts` + `group.service.ts` | Trung bình |
| 6 | SVC-02: `fetchCurrentUser` trả auth UUID thay vì app user ID | `user.service.ts` | Nhỏ |
| 7 | SCREEN-01: Dùng `getAuthUserId()` thay vì query trực tiếp | `groups/[id].tsx` | Nhỏ |
| 8 | BIZ-01: Thêm test cho `splitByRatio` edge case + document clamp behavior | `split.ts` + `split.test.ts` | Nhỏ |
| 9 | COMP-02: Memoize ratio preview trong ExpenseFormSheet | `ExpenseFormSheet.tsx` | Nhỏ |

### 🟢 Nice to have (Nit / Suggestion)

| # | Vấn đề | File | Effort |
|---|---|---|---|
| 10 | SCREEN-02: Thay `tripId!` bằng early return guard | `trips/[id].tsx` | Nhỏ |
| 11 | SCREEN-03: Log audit fetch errors thay vì catch trống | `trips/[id].tsx` | Nhỏ |
| 12 | COMP-03: Dùng composite key thay vì array index | `SettlementTab.tsx` | Nhỏ |
| 13 | BIZ-03: Dùng `?? 0` thay vì `\|\| 0` trong balanceMap | `balance.ts` | Nhỏ |
| 14 | SVC-03: Export `assertRole` thành shared helper | `group.service.ts` → `auth.helper.ts` | Trung bình |
| 15 | TEST-01: Thêm service layer tests | Mới | Lớn |
| 16 | PERF-01: Giảm duplicate fetch trong balance loading | `trip.store.ts` | Trung bình |

---

> **Kết luận:** Codebase có kiến trúc tốt và business logic chính xác. Ưu tiên sửa 3 vấn đề blocking (authorization gaps + unhandled rejections) — effort nhỏ nhưng impact lớn về bảo mật và stability.
