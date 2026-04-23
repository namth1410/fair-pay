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
├── services/         # Business logic — gọi Supabase, trả về typed data
│   └── auth.helper.ts  # Shared getAuthUserId() với 30s cache
├── stores/           # Zustand stores — gọi services, quản lý state
├── utils/            # Hàm thuần — balance, settlement, split, validate
├── types/            # database.types.ts — TypeScript mirrors SQLite schema
├── config/           # constants, supabase client, theme, fonts
├── hooks/            # useAppTheme (trả về { isDark, ...colors })
├── db/               # SQLite schema, database init, migrations
├── components/
│   ├── common/       # ErrorBoundary, SettingsSheet, CreateJoinSheet, OfflineBanner
│   ├── trip/         # ExpensesTab, BalancesTab, SettlementTab, HistoryTab
│   └── ui/           # AppCard, AppText, AppTextField, Money, ChipPicker, etc.
├── app/
│   ├── (auth)/       # login.tsx, register.tsx, forgot-password.tsx, reset-password.tsx
│   └── (main)/       # index.tsx, groups/[id].tsx, trips/[id].tsx
└── __tests__/        # balance.test.ts, settlement.test.ts, split.test.ts
```

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
- Expense + splits insert PHẢI có rollback nếu splits fail (đã có trong `expense.service.ts`).
- Ưu tiên `Promise.all()` cho queries độc lập — tránh chạy tuần tự không cần thiết.
- Khi loop filter data theo trip/group, dùng `Map` pre-index thay vì `.filter()` trong vòng lặp.

### TypeScript
- **KHÔNG dùng `: any`** trong service layer. Dùng `as Type` cast hoặc define interface cho Supabase returns.
- Khi thêm prop mới cho component, LUÔN kiểm tra và cập nhật interface/props type TRƯỚC khi dùng trong JSX.
- `Appearance.getColorScheme()` trả về `'light' | 'dark' | null` — KHÔNG dùng trực tiếp làm object key. Dùng ternary: `scheme === 'dark' ? X : Y`.

### Tiền VND
- Tất cả amount là INTEGER (đơn vị VND), bội của 1.000đ.
- Hàm split luôn dùng pattern "người cuối nhận remainder" — remainder PHẢI được clamp `Math.max(0, remaining)`.
- `validateAmount()` và `validateSplits()` nằm trong `src/utils/split.ts` — gọi trước khi tạo expense.
- Input validation cơ bản (tên, số tiền) nằm trong `src/utils/validate.ts` — gọi ở đầu service create functions.

### Component organization
- Screens lớn (>300 dòng) PHẢI tách thành sub-components theo tab/section.
- Sub-components dùng `React.memo()` và nhận data qua props — không gọi store trực tiếp.
- `useAppTheme()` trả về `{ isDark, ...colors }` — KHÔNG import `useIsDark()` riêng (deprecated).

### Audit logging
- `logAction()` dùng `getAuthUserId()` (app user ID) — KHÔNG dùng `supabase.auth.getUser().id` (auth UUID).
- Audit failures được bọc try/catch im lặng — KHÔNG throw ra ngoài.
- `before_data` và `after_data` có type `Record<string, unknown> | null`.

### Preset khoản chi
- Per-user, scope qua `getAuthUserId()`. Bảng `expense_presets` có RLS: `user_id = auth_user_id()`.
- Chỉ lưu `{title, amount, category}` — KHÔNG lưu `paid_by`, `splits` (đổi theo nhóm).
- Hard delete (không có `deleted_at`).
- `UNIQUE(user_id, title)` — service catch Postgres `23505` → throw "Đã có preset trùng tên".
- Reuse `validateName` + `validateAmount` (từ `src/utils/split.ts`, bội 1.000đ).
- KHÔNG log audit (personal data, không liên quan group).
- `EXPENSE_CATEGORIES` ở `src/config/constants.ts` là single source of truth — KHÔNG hardcode lại trong component.

### Testing
- Tests nằm trong `src/__tests__/` — chỉ test hàm thuần (utils).
- Luôn chạy `npx jest` + `npx tsc --noEmit` sau mỗi batch thay đổi.
- Khi thêm edge case cho split/settlement, nhớ test cả `amount >= 0` cho mọi member.
