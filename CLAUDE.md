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

### Testing
- Tests nằm trong `src/__tests__/` — chỉ test hàm thuần (utils).
- Luôn chạy `npx jest` + `npx tsc --noEmit` sau mỗi batch thay đổi.
- Khi thêm edge case cho split/settlement, nhớ test cả `amount >= 0` cho mọi member.
