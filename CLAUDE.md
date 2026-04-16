# CLAUDE.md — Fair Pay

## Dự án

Ứng dụng chia tiền nhóm cho React Native (Expo 55) + Supabase + Zustand + HeroUI Native.

## Lệnh thường dùng

```bash
npx jest              # Chạy tests (74 test cases)
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
│   ├── (auth)/       # login.tsx, register.tsx
│   └── (main)/       # index.tsx, groups/[id].tsx, trips/[id].tsx
└── __tests__/        # balance.test.ts, settlement.test.ts, split.test.ts
```

## Quy tắc quan trọng

### Auth helper
- **KHÔNG tạo `getAuthUserId()` cục bộ** trong service files. Luôn import từ `src/services/auth.helper.ts`.
- Hàm này có 30s cache — gọi `clearAuthCache()` khi user logout (đã tích hợp trong `auth.store.ts`).

### Authorization
- Mọi hàm service thay đổi dữ liệu nhóm PHẢI gọi `assertRole()` ở đầu hàm (đã có trong `group.service.ts`).
- `assertRole(groupId, ['owner', 'admin'])` — check caller có role trong danh sách cho phép.
- `removeMember` phải chặn xóa owner (`target.role === 'owner'`).

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

### Testing
- Tests nằm trong `src/__tests__/` — chỉ test hàm thuần (utils).
- Luôn chạy `npx jest` + `npx tsc --noEmit` sau mỗi batch thay đổi.
- Khi thêm edge case cho split/settlement, nhớ test cả `amount >= 0` cho mọi member.
