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
│   ├── common/       # ErrorBoundary, CreateJoinSheet, OfflineBanner, PresetFormModal
│   ├── trip/         # ExpensesTab, BalancesTab, SettlementTab, HistoryTab
│   └── ui/           # AppCard, AppText, AppTextField, Money, ChipPicker, etc.
├── app/
│   ├── (auth)/       # login.tsx, register.tsx, forgot-password.tsx, reset-password.tsx
│   └── (main)/       # index.tsx, settings.tsx, presets.tsx, groups/[id].tsx, trips/[id].tsx
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
- Sub-components dùng `React.memo()`. Nguồn data linh hoạt: props, store (Zustand), context — chọn cái hợp lý nhất theo từng case (data đã có sẵn ở parent → props; cross-tree shared state → store/context). Không có quy tắc cứng.
- `useAppTheme()` trả về `{ isDark, ...colors }` — KHÔNG import `useIsDark()` riêng (deprecated).

### TextInput trong BottomSheet (gorhom / heroui-native)
- IME tiếng Việt (telex/VNI) **bị loạn dấu/nhân ký tự** khi gõ trong `BottomSheetTextInput` controlled. Mọi re-render trong lúc compose dấu sẽ reset IME state. Lỗi gốc ở RN (issue #19339 đã lock không có resolution); gorhom #902/#1494 là cùng triệu chứng. Input ngoài bottom sheet KHÔNG bị.
- Pattern fix bắt buộc: input **uncontrolled** — `defaultValue=""` + `onChangeText` ghi vào `useRef` (không trigger render). Track riêng `hasContent` boundary boolean để bật/tắt nút submit (chỉ flip khi rỗng↔không rỗng, không re-render mỗi keystroke). Đọc giá trị từ ref ở `handleSubmit`.
- Reset input khi mở lại sheet: đổi `key={resetKey}` để remount. KHÔNG dùng `inputRef.current.clear()` — `BottomSheetTextInput` dùng GH `TextInput` branded type, không match `RefObject<RnTextInput>`.
- `autoFocus` trên `BottomSheetTextInput` luôn render gây 2 bug: (1) bàn phím tự mở khi screen mount (input mount từ đầu dù sheet đóng) và (2) sheet không extend khi focus lần đầu (gorhom keyboard listener chưa kịp gắn).
- Fix: chỉ render input sau khi sheet animate xong qua `onChange={(index) => setShowInput(index >= 0)}` trên `BottomSheet.Content`. `showInput=false` thì render placeholder `View` cùng kích thước input (tránh layout shift). `autoFocus` chỉ chạy khi sheet đã ở snap point ổn định → keyboardBehavior="extend" hoạt động đúng.
- Snap points + keyboard: `enableDynamicSizing={false}` + `snapPoints={['X%', 'Y%']}` + `keyboardBehavior="extend"` + `keyboardBlurBehavior="restore"` + `android_keyboardInputMode="adjustResize"`. Dynamic sizing không có "đỉnh" để extend → keyboard sẽ che input.
- Reference implementation: `src/components/common/AddVirtualMemberSheet.tsx`.

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
- Per-user, scope qua `getAuthUserId()`. Bảng `expense_presets` có RLS: `user_id = auth_user_id()`.
- Chỉ lưu `{title, amount, category}` — KHÔNG lưu `paid_by`, `splits` (đổi theo nhóm).
- Hard delete (không có `deleted_at`). Xóa có confirm qua `BouncyDialog`.
- `UNIQUE(user_id, title)` — service catch Postgres `23505` ở cả `createPreset` và `updatePreset` → throw "Đã có preset trùng tên".
- Reuse `validateAmount` (từ `src/utils/split.ts`, bội 1.000đ) + `validateName` (từ `src/utils/validate.ts`).
- Sort theo `updated_at DESC` — mới cập nhật/tạo ở đầu. Cột `updated_at` tự động refresh qua trigger `set_updated_at`.
- **Edit preset KHÔNG cascade** vào expense đã dùng — preset chỉ là template, expense đã có bản sao dữ liệu riêng.
- KHÔNG log audit (personal data, không liên quan group).
- `EXPENSE_CATEGORIES` ở `src/config/constants.ts` là single source of truth — KHÔNG hardcode lại trong component.

### Preset UI flow
- Màn quản lý riêng: route `(main)/presets.tsx` — list + CRUD đầy đủ (thêm/sửa/xóa). Entry từ Settings → "Preset khoản chi" (`router.push('/presets')`).
- Form thêm/sửa dùng chung `PresetFormModal` (BottomSheet); `preset` prop = null → thêm, có giá trị → sửa.
- Trong `ExpenseFormSheet`: pick preset bằng chip row horizontal (auto-fill title/amount/category). Tạo preset mới qua **Switch "Lưu làm preset"** trong step basic — tạo preset ngay sau khi submit expense thành công, KHÔNG có popup xác nhận riêng.
- Pre-check trùng title: khi Switch ON + title trim trùng preset cũ → `presetConflict` = true → disable nút "Tiếp tục"/"Thêm khoản chi" + hint inline. Title rỗng không trigger check.
- Khi user pick preset có sẵn → auto tắt Switch (tránh lưu lại bản thân nó).

### Testing
- Tests nằm trong `src/__tests__/` — chỉ test hàm thuần (utils).
- Luôn chạy `npx jest` + `npx tsc --noEmit` sau mỗi batch thay đổi.
- Khi thêm edge case cho split/settlement, nhớ test cả `amount >= 0` cho mọi member.
