# Fair Pay — i18n + Multi-Currency Implementation Plan

> **Trạng thái:** Plan draft, **chưa triển khai**. Lưu lại để tham khảo cho phase sau.
> **Ngày tạo:** 2026-05-19

## Context

App hiện chỉ hỗ trợ **tiếng Việt + VND**, hardcode toàn bộ string + tiền tệ trong code/SQL. Mục tiêu phase này:

1. Thêm hạ tầng **đa ngôn ngữ** (i18next), ship `vi` + `en` cùng lúc.
2. Thêm hạ tầng **multi-currency** per-trip với fallback group default, support 12 currencies.
3. Pivot **notification title** từ render-ở-SQL sang render-ở-client.
4. Refactor toàn bộ string/format hiện hardcode để chuẩn bị scale các ngôn ngữ/currency tiếp theo.

Lý do gộp i18n + multi-currency: 80+ chỗ format tiền nằm xen kẽ string ("150.000đ" trong câu) — refactor 2 lần là phí. Làm cùng cho 1 lần ship sạch.

**Effort estimate**: 7-9 tuần 1 dev (đã update sau rà soát lần 2 — thêm PDF export 40 string, Edge Functions 25 string, native localization, server-side FCM render). Đây là refactor toàn project chứ không phải patch.

## Surface coverage (sau rà soát lần 2)

13 nhóm string đã identify, KHÔNG còn nhóm nào sót khi rà:

| # | Surface | Count | Cách xử lý |
|---|---|---|---|
| 1 | UI screens + components TSX | ~400 | `useTranslation()` + `t()` |
| 2 | Service inline `throw new Error('VN')` | ~5 | `i18n.t()` direct (outside React) |
| 3 | Store toast/error strings (auth.store, etc.) | ~5 | `i18n.t()` direct |
| 4 | Util validation + error map (validate, error, split) | ~70 | i18n keys, generic placeholder |
| 5 | Audit ACTION_LABELS + Ẩn danh fallback | ~17 | i18n key per action |
| 6 | Notification format (client) | 24 templates | i18n key + CLDR plural |
| 7 | Notification format (SQL hardcoded titles) | 8 RPC titles | Pivot → NULL title, client/Edge render |
| 8 | Edge Functions HttpError | ~25 | Error code pattern + client map |
| 9 | PDF export HTML templates | ~40 | Pass locale + currency, dynamic `<html lang>` |
| 10 | App.json native permissions | 2 | Android strings.xml + iOS InfoPlist.strings |
| 11 | Notification channel name | 1 | `t()` + re-call setNotificationChannel |
| 12 | Accessibility labels (AppDock + nơi khác) | ~10 | `useTranslation()` |
| 13 | Date section "Hôm nay/Hôm qua" + datetime format | 2 + Intl | i18n key + `Intl.DateTimeFormat(locale)` |

KHÔNG cần i18n (cosmetic / dev-only):
- SQL `COMMENT ON FUNCTION` (developer-facing, không user-facing)
- `db/migrations.ts` comments
- `__DEV__` console.warn messages
- `CLAUDE.md`, `README.md` docs
- `app.json:scheme` / `bundleId` (Latin, không dịch)
- `APP_NAME = 'Fair Pay'` (Latin name, brand không dịch)
- `constants.ts` dev-only throw `'Thiếu EXPO_PUBLIC_*'` (chỉ DEV mode, dev là VN, không cần)

## Quyết định kiến trúc (đã chốt với user qua AskUserQuestion)

| Lĩnh vực | Quyết định |
|---|---|
| i18n library | `i18next` + `react-i18next` |
| Languages | `vi` (base) + `en` |
| Multi-currency scope | Gộp cùng phase này |
| Currency scope | **Per-trip** + `groups.default_currency` fallback |
| Currencies | Top 12: VND, USD, EUR, JPY, GBP, AUD, CAD, SGD, KRW, THB, MYR, IDR |
| Rounding | Per-currency `roundingStep` (VND: 1000, USD: 1, JPY: 1, KRW: 100, etc.) |
| Phase scope | Toàn project, ship 1 lần |
| Language UX | Auto-detect device → fallback `vi` → user override trong Settings |
| Notification title | Pivot sang client-side render (Option A từ survey) |

### Lý do per-trip + group default
- 99% user đi du lịch nội địa → group tạo với `default_currency='VND'` → mọi trip auto VND → KHÔNG thấy currency picker (UX y hệt hiện tại).
- User đi nước ngoài → tạo trip "Du lịch Tokyo" → đổi currency = JPY 1 lần ở form tạo trip → xong.
- Group dashboard nếu các trip có currency khác nhau → tách section theo currency, KHÔNG convert.

## Phần 1 — Hạ tầng i18n

### 1.1 Cài đặt
- `npm install i18next react-i18next expo-localization`
- `expo-localization` đã có trong Expo SDK 55, chỉ cần import.
- KHÔNG cài `i18next-react-native-async-storage-backend` — translation bundle qua `require()` (lý do: synchronous init, không lo race condition khi services gọi `t()` trước khi React mount).

### 1.2 Cấu trúc thư mục
```
src/i18n/
├── index.ts              # init i18next, export i18n instance
├── locales/
│   ├── vi.json           # base, source of truth
│   └── en.json
├── types.ts              # type-safe keys (generated hoặc manual)
└── useLocale.ts          # hook: { locale, setLocale, supported }
```

Translation JSON dùng **namespace flat-ish, key dot-separated**:
```json
{
  "common": { "ok": "OK", "cancel": "Hủy", "save": "Lưu", "delete": "Xóa" },
  "auth": { "login": { "title": "Đăng nhập", "submit": "Đăng nhập" } },
  "errors": { "invalid_credentials": "Email hoặc mật khẩu không đúng" },
  "validate": { "required": "{{field}} không được để trống" },
  "notification": {
    "expense_created_one": "{{actorName}} đã thêm khoản chi {{title}} ({{money}})",
    "expense_created_other": "{{actorName}} đã thêm {{count}} khoản chi"
  },
  "audit": { "expense_create": "Thêm khoản chi", "...": "..." }
}
```

i18next plural suffix `_one`/`_other` (CLDR) — quan trọng cho EN. VI không có số nhiều grammatical, nhưng vẫn dùng 2 key vì câu khác cấu trúc.

### 1.3 Init pattern ([src/i18n/index.ts](../src/i18n/index.ts))
```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import vi from './locales/vi.json';
import en from './locales/en.json';

const SUPPORTED = ['vi', 'en'] as const;
export type Locale = (typeof SUPPORTED)[number];

const LOCALE_KEY = 'fair_pay_locale';

function detectInitialLocale(): Locale {
  // Synchronous read of cached SecureStore-mirrored value or device locale.
  // SecureStore is async — read in bootstrap before i18n init.
  const device = Localization.getLocales()[0]?.languageCode;
  return SUPPORTED.includes(device as Locale) ? (device as Locale) : 'vi';
}

export async function bootstrapI18n(): Promise<void> {
  let saved: Locale | null = null;
  try {
    saved = (await SecureStore.getItemAsync(LOCALE_KEY)) as Locale | null;
  } catch {}
  const initial = saved && SUPPORTED.includes(saved) ? saved : detectInitialLocale();

  await i18n.use(initReactI18next).init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    lng: initial,
    fallbackLng: 'vi',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  try {
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
  } catch {}
}

export { i18n, SUPPORTED };
```

Boot order trong [src/app/_layout.tsx](../src/app/_layout.tsx) (modify hàm `boot()`):
```ts
await bootstrapI18n();          // ← thêm dòng này, TRƯỚC bootstrapPreferences
await bootstrapPreferences();
// ... rest
```

### 1.4 Type safety
Generate `src/i18n/types.ts` (hoặc viết tay nếu nhỏ) declare module `react-i18next` với `Resources = typeof vi`. → `t('auth.login.title')` autocomplete + báo lỗi nếu typo key.

### 1.5 Sử dụng ngoài React (services, utils, stores)
i18next instance là singleton — import trực tiếp:
```ts
import { i18n } from '../i18n';
throw new Error(i18n.t('errors.invalid_credentials'));
```
Vì `bootstrapI18n()` chạy đồng bộ ở boot, mọi `t()` call sau đó đều an toàn. Nếu lo race (vd Sentry log trước boot), fallback: `i18n.isInitialized ? i18n.t(key) : key`.

### 1.6 Language switcher UI
Thêm row "Ngôn ngữ / Language" trong [src/app/(main)/(tabs)/settings.tsx](../src/app/(main)/(tabs)/settings.tsx) section TÙY CHỈNH. Tap → BottomSheet picker (radio: Tiếng Việt / English). Lưu qua `setLocale()`. React re-render auto qua `useTranslation()`.

## Phần 2 — Hạ tầng Multi-Currency

### 2.1 Currency config ([src/config/currencies.ts](../src/config/currencies.ts) — NEW)
```ts
export type CurrencyCode = 'VND' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'AUD'
  | 'CAD' | 'SGD' | 'KRW' | 'THB' | 'MYR' | 'IDR';

export type CurrencyConfig = {
  code: CurrencyCode;
  symbol: string;
  decimals: number;        // số decimal places (VND: 0, USD: 2, JPY: 0)
  roundingStep: number;    // bước round cho split (VND: 1000, USD: 1, JPY: 1, KRW: 100)
  suggestionMultipliers: { single: number[]; multi: number[] }; // cho chip dock
  defaultSuggestions: number[]; // chips khi input rỗng
};

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  VND: { code: 'VND', symbol: 'đ', decimals: 0, roundingStep: 1000,
    suggestionMultipliers: { single: [10_000, 100_000, 1_000_000, 10_000_000],
                              multi: [1_000, 10_000, 100_000, 1_000_000] },
    defaultSuggestions: [50_000, 100_000, 200_000, 500_000] },
  USD: { code: 'USD', symbol: '$', decimals: 2, roundingStep: 1,
    suggestionMultipliers: { single: [100, 1_000, 10_000, 100_000],
                              multi: [10, 100, 1_000, 10_000] },
    defaultSuggestions: [500, 2000, 5000, 10000] }, // store as cents
  // ... 10 more
};

export const DEFAULT_CURRENCY: CurrencyCode = 'VND';
```

**Storage convention**: amount luôn là INTEGER trong **minor units** của currency (VND: đồng, USD: cent, JPY: yen, KRW: won). VND legacy data tự nhiên match (1 đồng = 1 minor unit), KHÔNG cần migrate giá trị.

### 2.2 Format helper ([src/utils/format.ts](../src/utils/format.ts) — REFACTOR)
Thay `formatVND(amount)` → `formatMoney(amount, currency, locale)`:
```ts
export function formatMoney(
  minorUnits: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  locale: string = i18n.language,
): string {
  const cfg = CURRENCIES[currency];
  const value = minorUnits / Math.pow(10, cfg.decimals);
  // VND vi: "150.000đ", VND en: "₫150,000", USD en: "$5.00"
  // Dùng Intl.NumberFormat với style:'currency' cho consistency
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  }).format(value);
}

export function formatBalance(minorUnits: number, currency: CurrencyCode, locale: string): string {
  const sign = minorUnits >= 0 ? '+' : '';
  return sign + formatMoney(minorUnits, currency, locale);
}
```

Giữ `formatVND` như **deprecated alias** trong file → call `formatMoney(_, 'VND', 'vi')` để tránh phải refactor hết cùng 1 lần. Sau đó grep + thay dần.

`formatDateVN`, `formatDateSection` → đổi tên `formatDate`, `formatDateSection` nhận `locale` param. "Hôm nay" / "Hôm qua" → key i18n.

`computeMoneySuggestions(rawDigits, currency)` → đọc `CURRENCIES[currency].suggestionMultipliers` thay vì hardcoded constants.

### 2.3 Validate ([src/utils/split.ts](../src/utils/split.ts) — REFACTOR)
```ts
export function validateAmount(amount: number, currency: CurrencyCode): string | null {
  if (!Number.isInteger(amount)) return i18n.t('validate.amount_must_be_integer');
  if (amount <= 0) return i18n.t('validate.amount_must_be_positive');
  const step = CURRENCIES[currency].roundingStep;
  if (amount % step !== 0) {
    return i18n.t('validate.amount_must_be_multiple_of', {
      step: formatMoney(step, currency),
    });
  }
  return null;
}
```

`splitEqual(total, memberIds, currency)`, `splitByRatio(total, members, currency)` → đọc `roundingStep` từ currency thay vì hardcoded `1000`.

**Explanation strings** trong split.ts (12 chỗ "Bước 1...") → i18n key với placeholder. Đây là phần khó nhất phía utils — plural + number + currency inline.

### 2.4 Settlement ([src/utils/settlement.ts](../src/utils/settlement.ts) — REFACTOR)
- `TOLERANCE = 1000` (hardcoded line 11) → `getTolerance(currency)` = `CURRENCIES[currency].roundingStep`.
- Rounding logic `Math.round(.../ 1000) * 1000` (line 48) → dùng step động.

### 2.5 Constants ([src/config/constants.ts](../src/config/constants.ts) — REFACTOR)
- `SETTLE_SUGGEST_MIN_AMOUNT = 200_000` (VND-only) → đổi thành `getSettleSuggestMin(currency)` lookup table per-currency (VND: 200_000, USD: 1000 cent = $10, JPY: 1000 yen, etc.). Hoặc giữ logic VND-only cho phase này, ghi TODO.

### 2.6 UI components nhận currency prop
- [src/components/ui/Money.tsx](../src/components/ui/Money.tsx) — thêm `currency: CurrencyCode` prop, render symbol theo config thay vì hardcoded `'₫'`.
- [src/components/ui/MoneyTextField.tsx](../src/components/ui/MoneyTextField.tsx) — currency prop, suffix động.
- [src/components/ui/MoneyChipsDock.tsx](../src/components/ui/MoneyChipsDock.tsx) — currency prop, render chip label qua `formatMoney`.
- Tất cả form chứa Money input phải pass currency từ `trip.currency` (hoặc `group.default_currency` cho preset global).

## Phần 3 — Schema migration multi-currency

### 3.1 Migration `supabase/migrations/<timestamp>_multi_currency.sql` (NEW)
```sql
-- groups: default currency
ALTER TABLE groups ADD COLUMN default_currency text NOT NULL DEFAULT 'VND'
  CHECK (default_currency IN ('VND','USD','EUR','JPY','GBP','AUD','CAD','SGD','KRW','THB','MYR','IDR'));

-- trips: actual currency
ALTER TABLE trips ADD COLUMN currency text NOT NULL DEFAULT 'VND'
  CHECK (currency IN ('VND','USD','EUR','JPY','GBP','AUD','CAD','SGD','KRW','THB','MYR','IDR'));

-- Backfill: trip.currency = group.default_currency (default đã là VND, no-op cho data hiện có)

-- expenses & payments: KHÔNG thêm cột (denormalize không cần — join trip rẻ + tránh inconsistency)
-- expense_presets: thêm currency (vì trip-pinned preset có thể khác trip parent)
ALTER TABLE expense_presets ADD COLUMN currency text NOT NULL DEFAULT 'VND'
  CHECK (currency IN (...));

-- users.locale: cho server-side FCM render
ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'vi'
  CHECK (locale IN ('vi','en'));
```

### 3.2 Service updates
- [src/services/group.service.ts](../src/services/group.service.ts) — `createGroup` nhận `default_currency` param.
- [src/services/trip.service.ts](../src/services/trip.service.ts) — `createTrip` nhận `currency` (default = `group.default_currency`).
- [src/services/expense.service.ts](../src/services/expense.service.ts) + RPC `create_expense` — validate `amount` theo `trip.currency.roundingStep` ở SQL (thêm function `_get_currency_step(currency text)` hoặc check ở TS trước RPC).
- [src/services/preset.service.ts](../src/services/preset.service.ts) — preset có currency, apply vào trip phải check match (warning nếu khác).

### 3.3 Types
[src/types/database.types.ts](../src/types/database.types.ts) — thêm field `default_currency`, `currency`, `locale` vào GroupRow, TripRow, PresetRow, UserRow.

## Phần 4 — Notification SQL pivot + FCM server-side render

### 4.1 Vấn đề mới phát hiện
[supabase/functions/send-push/index.ts:127-128](../supabase/functions/send-push/index.ts) — Edge Function gửi FCM body từ `notification.title` lấy thẳng từ DB. Nếu pivot SQL để title=NULL, push notification ở background/killed app sẽ hiển thị rỗng. **Phải port `formatNotificationTitle` sang Deno** để Edge Function tự compose title server-side theo locale của recipient.

### 4.2 Strategy: `users.locale` column + dual-implementation

Thêm cột `users.locale text NOT NULL DEFAULT 'vi'` (lưu locale preference per-user). Client `setLocale()` ghi cả SecureStore + UPDATE `users.locale`. Edge Function dùng locale này.

Shared format logic 2 nơi:
- [src/utils/notificationFormat.ts](../src/utils/notificationFormat.ts) — TS cho client
- `supabase/functions/_shared/notificationFormat.ts` (NEW) — Deno mirror, sync logic + i18n key map

Cả 2 đọc cùng JSON dictionary (`vi.json`, `en.json`). Hoặc duplicate dict trong shared folder + có test parity. Trade-off: maintenance burden vs simplicity. **Recommend duplicate** (translation JSON nhỏ, đổi không thường xuyên, parity test catch drift).

### 4.3 SQL changes
Migration mới `supabase/migrations/<timestamp>_notif_client_render.sql`:
- Modify `_create_notifications_dedup`: khi UPDATE dedup count++, **KHÔNG gọi `_format_dedup_title`** nữa. Giữ `title` nguyên (hoặc NULL), tăng `data.count`. Client/Edge tự render plural.
- Modify `approve_join_request` (line 100 trong [20260511160200_approve_join_request_rpc.sql](../supabase/migrations/20260511160200_approve_join_request_rpc.sql)) — `v_title := NULL`, ghi đủ `data.group_name`.
- Modify `request_join_by_code` (line 96 trong [20260513120000_request_join_by_code_rpc.sql](../supabase/migrations/20260513120000_request_join_by_code_rpc.sql)) — title NULL, data đủ params.
- Modify `invite_rpcs.sql` ([20260514150100_invite_rpcs.sql](../supabase/migrations/20260514150100_invite_rpcs.sql)) lines 120, 278, 279, 388 — title NULL, data đủ.
- Bỏ fallback `'Thành viên'` hardcode ở 5 chỗ (lines 64, 98, 225, 384, 473) — return NULL, client/Edge format thay bằng `t('member.anonymous')`.
- Function `_format_dedup_title` → giữ lại nhưng deprecate (comment), KHÔNG xóa để rollback an toàn.
- Thêm cột `users.locale` qua ALTER TABLE.

### 4.4 Client changes
- [src/utils/notificationFormat.ts](../src/utils/notificationFormat.ts) — refactor 24 case `switch` sang i18n key. Mỗi notification type 2 key (`_one` / `_other`). Pass params qua interpolation. Trả về function `formatNotificationTitle(type, data, locale)` không phụ thuộc react context.
- [src/stores/notification.store.ts](../src/stores/notification.store.ts) — khi fetch/realtime nhận notification:
  - `title` từ DB sẽ NULL cho notif mới → call `formatNotificationTitle(type, data, currentLocale)`.
  - Legacy `title` có VN → vẫn dùng nguyên (fallback `title ?? format(...)`).
  - Subscribe `i18n.on('languageChanged')` → force re-render list (invalidate cache memo).

### 4.5 Edge Function changes
- `supabase/functions/_shared/notificationFormat.ts` (NEW) — Deno port của TS function.
- `supabase/functions/send-push/index.ts` — lookup `users.locale`, compose `notification.title` từ `(type, data, locale)` thay vì đọc `notification.title` trực tiếp. Body có thể để rỗng (Android sẽ chỉ hiện title) hoặc set ngắn.
- Cập nhật trigger SQL `notifications_fcm_insert` để gọi send-push với notification_id, send-push tự fetch user + format.

### 4.6 Backward compat
- Notification cũ trong DB giữ VN title → user EN sẽ thấy VN cho notif tạo trước migration. **Acceptable** vì TTL 60 ngày → tự sạch.
- KHÔNG migrate dữ liệu cũ (effort cao, ROI thấp).

## Phần 4B — Native localization (iOS Info.plist + Android strings.xml)

### Vấn đề
[app.json](../app.json) lines 43, 50 — permission strings VN hardcoded cho `expo-image-picker` và `react-native-vision-camera`. Đây là **native** strings:
- iOS: bake vào `Info.plist` (NSCameraUsageDescription)
- Android: bake vào AndroidManifest hoặc strings.xml

Native permission dialog do OS render theo **system locale**, KHÔNG qua i18next runtime của app. Phải có file localized riêng.

### Cách làm
Repo này là **bare workflow** (`android/` committed), nên edit trực tiếp:

**Android** (`android/app/src/main/res/`):
- `values/strings.xml` — default (vi)
- `values-en/strings.xml` — English
- Move các string user-facing native từ `app.json` sang strings.xml resource (`@string/camera_permission`).
- Tham khảo: `expo-image-picker` plugin generate `<string name="expo_image_picker_camera_permission">...</string>` — override file đó.

**iOS** (`ios/<appname>/`):
- `vi.lproj/InfoPlist.strings` — default
- `en.lproj/InfoPlist.strings` — English
- `NSCameraUsageDescription = "..."`
- Note: iOS chưa support FCM trong app này, nhưng iOS publish vẫn cần native strings cho camera permission.

**Khi `expo prebuild`**: cấu hình native localization sẽ bị wipe (giống Android signing). Phải **document trong CLAUDE.md** + commit các file localized vào repo. Hoặc viết script restore tự động.

### Notification channel name
[src/services/pushNotification.service.ts:30](../src/services/pushNotification.service.ts) — `name: 'Mặc định'` hiển thị trong Android Settings → App → Notifications.
- Option A: Dùng `t('notification.channel.default')` khi gọi `setNotificationChannelAsync`. Re-call khi user đổi locale (subscribe `languageChanged`).
- Option B: Move sang Android `strings.xml` qua `expo-notifications` plugin config.
- **Recommend A** vì đồng bộ với app locale chứ không system locale.

### App name / scheme
`APP_NAME = 'Fair Pay'` (Latin, OK cho cả vi/en, không cần dịch). `APP_SLOGAN = 'Chia tiền · Không chia rẽ'` — chỉ hiển thị trong app (splash, footer PDF), KHÔNG phải native → dùng i18n key bình thường.

## Phần 4C — Edge Functions i18n (error code pattern)

### Vấn đề
8 Edge Function files có **~25 VN HttpError messages**:
- [_shared/auth.ts](../supabase/functions/_shared/auth.ts) — `'Chưa đăng nhập'`, `'Token không hợp lệ'`, `'User chưa khởi tạo'`, `'Lỗi máy chủ'`
- [group-avatar-presign/index.ts](../supabase/functions/group-avatar-presign/index.ts) — `'Thiếu groupId'`, `'Chỉ admin mới được đổi avatar nhóm'`, `'Nhóm đã đổi avatar tối đa 3 lần trong 7 ngày'`, `'Bạn đã đổi avatar tối đa 20 lần trong ngày'`
- [group-avatar-commit/index.ts](../supabase/functions/group-avatar-commit/index.ts) — 9 strings
- [group-avatar-remove/index.ts](../supabase/functions/group-avatar-remove/index.ts) — 4 strings
- [expense-image-presign/index.ts](../supabase/functions/expense-image-presign/index.ts) — `'Bạn đã upload tối đa 100 ảnh trong ngày'`, `'Nhóm đã upload tối đa 50 ảnh khoản chi trong ngày'`, etc.
- [expense-image-commit/index.ts](../supabase/functions/expense-image-commit/index.ts) + [expense-image-remove/index.ts](../supabase/functions/expense-image-remove/index.ts)

Edge Functions không biết user locale (hoặc phải fetch users.locale). **Tốt hơn**: return error CODE, client dịch.

### Refactor pattern
```ts
// BEFORE (Edge)
throw new HttpError(403, 'Chỉ admin mới được đổi avatar nhóm');

// AFTER (Edge)
throw new HttpError(403, { code: 'group_avatar_admin_only' });

// Client (caller code)
try { ... } catch (e) {
  const code = (e as any).body?.code;
  toast.show({ label: t(`api_errors.${code}`) });
}
```

Thay `HttpError` constructor để body luôn JSON `{ code, message? }`. Client parse code → i18n key map. Add 25 keys mới vào `api_errors.*` namespace trong vi.json/en.json.

Backward compat: legacy clients vẫn nhận message text → giữ `message` field bằng English fallback `getDefaultMessageForCode(code)`.

## Phần 4D — PDF export i18n (`exportHtml.ts`)

### Vấn đề
[src/utils/exportHtml.ts](../src/utils/exportHtml.ts) — **~40 VN strings hardcoded** trong PDF templates. Đây là pure function trả HTML string → render qua `expo-print`.

Strings cần dịch:
- Table headers: "Ngày", "Khoản chi", "Số tiền", "Người trả", "Chia cho", "Người nhận", "Ghi chú", "Thành viên", "Số dư", "Trạng thái", "Diễn giải", "Ảnh hưởng"
- Section titles: "Các khoản chi", "Thanh toán đã ghi nhận", "Số dư cuối kỳ", "Số nợ chưa quyết toán", "Gợi ý quyết toán", "Diễn giải chi tiết (liên quan {name})", "Toàn bộ khoản chi của chuyến đi"
- Stats labels: "Tổng chi", "Khoản chi", "Thanh toán", "Thành viên"
- Status badges: "Đã hoàn thành", "Đang mở"
- Empty states: "Chưa có khoản chi nào.", "Chưa có thanh toán nào được ghi nhận.", "Chưa có dữ liệu số dư.", "Đã quyết toán xong.", "Cả nhóm đã cân bằng — không cần thanh toán thêm."
- Inline phrases: "Chia đều cho cả nhóm ({n} người)", "được nợ", "đang nợ", "cân bằng", "Bạn đã thanh toán", "Đã nhận thanh toán", "Ngày xuất: {date}", "Nhóm: {name}", "Diễn giải cho {name}"
- Warning banner: "⚠ Chuyến đi đã hoàn thành nhưng vẫn còn số dư chưa quyết toán..."
- Footer: "Tạo bởi Fair Pay — Chia tiền · Không chia rẽ"
- Explanation details (~5 templates): "{name} trả {amount} · không chịu phần nào", "{name} trả {amount} · phần {name} chịu {share}", etc.
- HTML attribute: `<html lang="vi">` → dynamic

### Refactor
- Functions phải nhận `locale: string` + `currency: CurrencyCode` params (không phụ thuộc React).
- Service caller [src/services/export.service.ts](../src/services/export.service.ts) pass `i18n.language` + `trip.currency`.
- Date format trong PDF (`formatDate` line 77-84) đang dùng `getDate()` thô — đổi sang `Intl.DateTimeFormat(locale, ...)`.
- `formatVND` calls (~20 chỗ) → `formatMoney(_, currency, locale)`.

## Phần 4E — `explainBalance.ts` return keys thay vì strings

[src/utils/explainBalance.ts](../src/utils/explainBalance.ts) lines 113, 122 — pure function trả `ExplanationLine[]` nhưng hardcoded VN:
```ts
title: 'Bạn đã thanh toán',   // line 113
title: 'Đã nhận thanh toán',  // line 122
```

Refactor: return `titleKey: 'explain.payment_sent' | 'explain.payment_received'` thay vì `title: string`. UI component ([src/components/trip/MyBalanceExplanationSheet.tsx](../src/components/trip/MyBalanceExplanationSheet.tsx)) gọi `t(line.titleKey)`. PDF export tương tự gọi format function pass locale.

ExplanationKind đã là enum-like — chỉ cần extend interface để UI biết khi nào dịch title vs khi nào dùng raw (vd `kind === 'expense_paid_only'` → title là tên expense raw, không dịch).

## Phần 5 — UI/Screen refactor (450-500 strings)

Sequence để minimize merge conflict + dễ test:

### 5.1 Order (mỗi bước = 1 commit/PR nhỏ)

| # | Scope | Files | LOC est |
|---|---|---|---|
| 1 | Infra + helpers | `src/i18n/*`, `src/config/currencies.ts`, refactor `format.ts`, `validate.ts`, `split.ts`, `settlement.ts`, `error.ts` (ERROR_MAP), `audit.service.ts` (ACTION_LABELS + 'Ẩn danh' fallback), `explainBalance.ts` (return keys) | ~900 |
| 2 | Schema + service signatures | 2 migrations (multi-currency + notif pivot + users.locale), `database.types.ts`, `group/trip/expense/preset.service.ts`, throw errors trong `preset.service.ts`/`auth.store.ts`/`imageProcessing.ts` | ~500 |
| 3 | Money components | `Money.tsx`, `MoneyTextField.tsx`, `MoneyChipsDock.tsx`, `FloatingMoneyInput.tsx` | ~300 |
| 4 | Auth screens (4 files) | `login/register/forgot-password/reset-password` | ~200 |
| 5 | Settings screen + Language picker | `(tabs)/settings.tsx`, new `LanguageSheet`, persist `users.locale` qua service | ~300 |
| 6 | Notification SQL pivot + client format + Edge Function port | migration, `notificationFormat.ts`, `notification.store.ts`, `_shared/notificationFormat.ts` (Deno NEW), `send-push/index.ts` | ~600 |
| 7 | Edge Functions error codes | `_shared/auth.ts`, 7 R2 functions — replace VN message với code | ~200 |
| 8 | Simple tabs + AppDock | `ExpensesTab`, `BalancesTab`, `HistoryTab`, `MembersTab`, `TripsTab`, `AppDock.tsx` (5 accessibilityLabel), `OfflineBanner`, `ErrorBoundary` (fallback) | ~500 |
| 9 | Complex forms | `ExpenseFormScreen`, `PresetFormScreen`, `SettlementTab`, currency picker UX trong trip create, `MyBalanceExplanationSheet` | ~700 |
| 10 | Sheets + dialogs | `CreateJoinSheet`, `CreateTripSheet`, `AddMemberSheet`, `GroupEditSheet`, `RenameTripSheet`, `WelcomeDialog`, `FeedbackSheet`, `ImagePickerSheet`, etc. (~12 sheets) | ~400 |
| 11 | Remaining screens | `groups/[id]`, `trips/[id]`, presets, notifications list, home, header slots | ~500 |
| 12 | PDF export + permissions + native | `exportHtml.ts` (40 strings), `permissions.ts` (Alert), `pushNotification.service.ts` (channel name) | ~300 |
| 13 | Native localization | Android `res/values*/strings.xml`, iOS `*.lproj/InfoPlist.strings`, restore-after-prebuild script, update CLAUDE.md | ~100 |

### 5.2 Migration pattern cho mỗi component
```tsx
// BEFORE
<AppText>Đăng nhập</AppText>
toast.show({ label: 'Đã thêm khoản chi' });

// AFTER
const { t } = useTranslation();
<AppText>{t('auth.login.title')}</AppText>
toast.show({ label: t('expense.created_toast') });
```

Cho code ngoài React (service throw error):
```ts
// BEFORE
throw new Error('Email hoặc mật khẩu không đúng');
// AFTER
throw new Error(i18n.t('errors.invalid_credentials'));
```

### 5.3 Critical patterns to refactor

**A. String concat với biến** (~25 chỗ):
```tsx
// BEFORE: `Xóa "${member.display_name}" khỏi nhóm?`
// AFTER:  t('member.delete_confirm', { name: member.display_name })
```

**B. Plural** (~12 chỗ trong `notificationFormat.ts`):
```ts
// BEFORE: count > 1 ? `${name} đã thêm ${count} khoản chi` : `${name} đã thêm khoản chi ${title}`
// AFTER:  t('notification.expense_created', { count, name, title })
//         vi: { expense_created_one: '{{name}} đã thêm khoản chi {{title}}',
//               expense_created_other: '{{name}} đã thêm {{count}} khoản chi' }
```

**C. Số/tiền inline trong câu** (~80 chỗ, đặc biệt `split.ts`):
```ts
// BEFORE: `Bước 2: Làm tròn → ${rounded.toLocaleString('vi-VN')}đ/người (bội của 1.000đ)`
// AFTER:  t('split.step_rounding', { rounded: formatMoney(rounded, currency), step: formatMoney(step, currency) })
```

**D. Field label trong validation generic**:
```ts
// BEFORE: `${label} không được để trống`
// AFTER:  t('validate.required', { field: t(`field.${fieldKey}`) })
//         hoặc giữ label string nếu UI đã có chuỗi sẵn
```

## Phần 6 — Files critical cần modify (top references)

| Path | Lý do |
|---|---|
| [src/app/_layout.tsx](../src/app/_layout.tsx) | Thêm `bootstrapI18n()` vào `boot()`, init order |
| `src/i18n/index.ts` | **NEW** — i18next init |
| `src/i18n/locales/vi.json` | **NEW** — base translations |
| `src/i18n/locales/en.json` | **NEW** — English |
| `src/config/currencies.ts` | **NEW** — currency config + helpers |
| [src/utils/format.ts](../src/utils/format.ts) | `formatVND` → `formatMoney(amount, currency, locale)`, date i18n |
| [src/utils/split.ts](../src/utils/split.ts) | `validateAmount`/`splitEqual`/`splitByRatio` per-currency rounding + explanation i18n |
| [src/utils/settlement.ts](../src/utils/settlement.ts) | TOLERANCE động |
| [src/utils/validate.ts](../src/utils/validate.ts) | 10 messages → i18n |
| [src/utils/error.ts](../src/utils/error.ts) | 40 ERROR_MAP → i18n |
| [src/utils/notificationFormat.ts](../src/utils/notificationFormat.ts) | 24 case → i18n key, plural CLDR |
| [src/services/audit.service.ts](../src/services/audit.service.ts) | 17 ACTION_LABELS → i18n |
| [src/services/group.service.ts](../src/services/group.service.ts) | `createGroup` nhận `default_currency` |
| [src/services/trip.service.ts](../src/services/trip.service.ts) | `createTrip` nhận `currency` |
| [src/services/expense.service.ts](../src/services/expense.service.ts) | validate amount per-currency |
| [src/services/preset.service.ts](../src/services/preset.service.ts) | preset có currency |
| [src/services/notification.service.ts](../src/services/notification.service.ts) | RPC nhận `data` đủ params cho client render |
| [src/stores/notification.store.ts](../src/stores/notification.store.ts) | Render title client-side, listen `languageChanged` |
| [src/types/database.types.ts](../src/types/database.types.ts) | Thêm `default_currency`, `currency`, `locale` fields |
| [src/components/ui/Money.tsx](../src/components/ui/Money.tsx) | Currency prop |
| [src/components/ui/MoneyTextField.tsx](../src/components/ui/MoneyTextField.tsx) | Currency prop |
| [src/components/ui/MoneyChipsDock.tsx](../src/components/ui/MoneyChipsDock.tsx) | Currency prop |
| [src/components/expense/ExpenseFormScreen.tsx](../src/components/expense/ExpenseFormScreen.tsx) | ~30 strings + currency awareness |
| [src/components/preset/PresetFormScreen.tsx](../src/components/preset/PresetFormScreen.tsx) | ~15 strings + currency picker |
| [src/components/common/CreateTripSheet.tsx](../src/components/common/CreateTripSheet.tsx) | **Currency picker** (collapsed nếu = group default) |
| [src/app/(main)/(tabs)/settings.tsx](../src/app/(main)/(tabs)/settings.tsx) | ~25 strings + Language picker row |
| `supabase/migrations/<ts>_multi_currency.sql` | **NEW** — schema currency + `users.locale` |
| `supabase/migrations/<ts>_notif_client_render.sql` | **NEW** — bỏ SQL format title + bỏ 'Thành viên' fallback ở 5 RPC |
| [src/utils/exportHtml.ts](../src/utils/exportHtml.ts) | 40 VN strings + dynamic `<html lang>` + locale-aware date/money |
| [src/utils/explainBalance.ts](../src/utils/explainBalance.ts) | Return `titleKey` thay vì `title` (line 113, 122) |
| [src/utils/permissions.ts](../src/utils/permissions.ts) | Alert.alert i18n |
| [src/utils/imageProcessing.ts](../src/utils/imageProcessing.ts) | throw Error i18n (line 90) |
| [src/stores/auth.store.ts](../src/stores/auth.store.ts) | 2 throw Error VN (line 132, 152) |
| [src/services/preset.service.ts](../src/services/preset.service.ts) | 2 throw Error duplicate (line 114, 152) |
| [src/services/audit.service.ts](../src/services/audit.service.ts) | ACTION_LABELS + 'Ẩn danh' fallback (line 65) |
| [src/services/pushNotification.service.ts](../src/services/pushNotification.service.ts) | Channel name 'Mặc định' + re-call on locale change |
| [src/components/common/AppDock.tsx](../src/components/common/AppDock.tsx) | 5 accessibilityLabel VN |
| [src/components/common/ErrorBoundary.tsx](../src/components/common/ErrorBoundary.tsx) | 4 strings + static fallback nếu i18n chưa init |
| [src/components/common/OfflineBanner.tsx](../src/components/common/OfflineBanner.tsx) | 1 string |
| [src/components/common/WelcomeDialog.tsx](../src/components/common/WelcomeDialog.tsx) | 4 strings |
| [supabase/functions/_shared/auth.ts](../supabase/functions/_shared/auth.ts) | 4 HttpError → code |
| `supabase/functions/_shared/notificationFormat.ts` | **NEW** — Deno mirror cho FCM |
| [supabase/functions/send-push/index.ts](../supabase/functions/send-push/index.ts) | Lookup user.locale + compose title |
| `supabase/functions/group-avatar-*/index.ts` (3 files) | HttpError → code (~17 strings) |
| `supabase/functions/expense-image-*/index.ts` (3 files) | HttpError → code (~10 strings) |
| [app.json](../app.json) | Move 2 cameraPermission strings → native localized resource |
| `android/app/src/main/res/values/strings.xml` | **NEW** — default vi |
| `android/app/src/main/res/values-en/strings.xml` | **NEW** — English |
| `ios/<app>/vi.lproj/InfoPlist.strings` | **NEW** (khi prebuild iOS) |
| `ios/<app>/en.lproj/InfoPlist.strings` | **NEW** (khi prebuild iOS) |

## Phần 7 — Test plan

### 7.1 Unit tests (Jest)
- `src/__tests__/i18n.test.ts` — **NEW**: load vi.json + en.json, assert mọi key bên vi đều có ở en (KHÔNG missing key), không có key thừa.
- `src/__tests__/format.test.ts` — **NEW**: `formatMoney(150000, 'VND', 'vi')` = "150.000 ₫"; `formatMoney(500, 'USD', 'en')` = "$5.00"; `formatMoney(5000, 'JPY', 'en')` = "¥5,000"; etc.
- `src/__tests__/split.test.ts` — UPDATE: thêm test với USD (round 1 cent), JPY (round 1 yen), KRW (round 100 won). Verify `amount >= 0` cho mọi member.
- `src/__tests__/settlement.test.ts` — UPDATE: test multi-currency trip không bao giờ mix.
- `src/__tests__/notification.test.ts` — UPDATE/NEW: `formatNotificationTitle({ type, data, locale: 'en' })` render English đúng.

### 7.2 Manual end-to-end
1. Cold start: device locale `en-US` → app phải khởi động English.
2. Settings → Language → "Tiếng Việt" → toàn app rerender VN.
3. Đổi language khi đang ở trip detail → notification list, balance, expense list rerender đúng locale.
4. Tạo group mới → mặc định `default_currency = 'VND'`.
5. Tạo trip → currency picker collapsed = VND.
6. Tạo trip thứ 2 → expand picker → chọn JPY → trip này dùng yen. Money chips × 1000/×100 (per JPY config).
7. Tạo expense trong trip JPY → amount input không cho phép giá trị `% 1000 ≠ 0` (vì JPY roundingStep = 1).
8. Settle trong trip JPY → suggestion list dùng JPY.
9. Notification dedup: tạo 3 expense liên tiếp trong < 10 phút → notification rerender plural client-side đúng locale.
10. Logout → đổi locale → login lại → giữ locale đã chọn (lưu SecureStore không reset).
11. Update password reset email template Supabase (nếu cần) — out of scope plan này nhưng note.
12. **FCM push test (Android background)**: locale=`en`, lock screen, trigger expense.created → notification banner hiển thị **English title** (server-side Edge Function format đúng).
13. **PDF export test**: locale=`en`, currency=`JPY` trip → export PDF → toàn bộ headers/labels/footer English, money format ¥. PDF `<html lang="en">` đúng.
14. **Native permission test**: thay device locale = English, fresh install, tap "Chụp ảnh" → OS dialog hiển thị **English** "Allow Fair Pay to use camera..." (từ `values-en/strings.xml`).
15. **Notification channel name test**: vào Android Settings → App Fair Pay → Notifications → channel name hiển thị theo app locale (re-call setNotificationChannel khi đổi locale).
16. **Screen reader test**: bật TalkBack, focus AppDock tab → đọc đúng English ("Home", "Presets", "Add expense", "Notifications", "Settings") khi locale=en.
17. **Edge Function error test**: upload ảnh vượt 2MB → toast hiển thị message English, không phải `'Ảnh vượt quá 2 MB'` raw.
18. **Backward compat notification**: notification cũ trong DB (title VN đã set trước migration) hiển thị VN ngay cả khi locale=en — chấp nhận, TTL 60 ngày tự sạch.

### 7.3 Type check + lint
- `npx tsc --noEmit` PASS toàn project sau mỗi commit.
- `npm run lint` clean.
- Total tests: 85 hiện tại → estimate 110-120 sau phase này.

## Phần 8 — Rủi ro + mitigation

| Rủi ro | Mitigation |
|---|---|
| Translation key drift giữa vi/en | Unit test ép parity; CI fail nếu mismatch |
| `i18n.t()` gọi trước init → string `key` lộ ra UI | `bootstrapI18n()` SỚM trong `boot()`; init synchronous với bundled JSON; fallback `i18n.isInitialized` check trong services |
| Multi-currency phá split logic (1.000đ pattern) | Test ma trận: 12 currencies × splitEqual/splitByRatio + edge case `amount < n * step` |
| User cũ có data VND → migration cộng cột default 'VND' | DEFAULT 'VND' + NOT NULL không backfill rủi ro |
| Notification cũ giữ VN cho user EN | Acceptable, TTL 60 ngày tự sạch. Document trong release notes |
| Font BeVietnamPro với English | Test render — Latin chars OK với font này. Nếu chữ vỡ, thêm fallback `system-ui` cho EN locale |
| Settlement balance khi 1 group có nhiều trip currency | Group dashboard tách section theo currency, KHÔNG sum cross-currency |
| Currency picker UX phình form tạo trip | Default collapsed = group default; tap expand mới hiện picker |
| `Intl.NumberFormat` không support currency code lạ trên Hermes cũ | Test trên Android API 24+; nếu fail fallback symbol manual từ `CURRENCIES[code].symbol` |
| Refactor 6-8 tuần liên tục, conflict với feature dev | Recommend: branch feature freeze trong phase; hoặc rebase weekly |
| FCM body bị NULL sau pivot → notification trống ở background | Edge Function `send-push` MUST port formatNotificationTitle + đọc user.locale TRƯỚC khi pivot SQL. Deploy theo thứ tự: Edge Function trước → SQL pivot sau |
| `ErrorBoundary` fallback chạy trước i18n init → key trơ trẽn lộ ra | Static English fallback strings hardcode trong ErrorBoundary, ngoài i18n (vì lỗi có thể xảy ra trong chính bootstrap i18n) |
| TS ↔ Deno dual implementation của formatNotificationTitle drift | Unit test parity: shared JSON dictionary load cả 2 phía, snapshot output cho 24 type × 2 locale × 2 count (=96 case), compare TS vs Deno |
| Native localization wipe sau `expo prebuild --clean` | Document trong CLAUDE.md (giống Android signing pattern); commit script `scripts/restore-native-i18n.sh` để copy lại files |
| User đổi locale qua Settings → users.locale UPDATE fail offline → server gửi push wrong locale | Acceptable: queue UPDATE trong sync layer; server fallback locale='vi' nếu lỗi đọc users.locale |
| Currencies như VND lưu Intl format ra `150.000 ₫` có space → break UI assumption | Test trên Money component, có thể strip space hoặc dùng `formatToParts` để control output |
| Edge Function R2 error code map drift với client | Single source: `supabase/functions/_shared/errorCodes.ts` export const, client import qua build copy hoặc shared types repo |

## Phần 9 — Memory cập nhật sau khi xong

Sau khi merge phase này, update memory:
- Thêm `feedback_i18n_pattern.md` — pattern dùng `useTranslation` vs `i18n.t` ngoài React, plural key naming convention.
- Thêm `project_multi_currency.md` — quyết định per-trip + group default, list 12 currencies, roundingStep map.
- Update CLAUDE.md section "Tiền VND" → "Tiền (multi-currency)".

## Verification (sau khi implement)

```bash
npx tsc --noEmit          # Phải PASS
npx jest                  # Phải PASS (110+ tests)
npm run lint              # Phải clean
npm start                 # Dev server
```

Manual smoke tests theo §7.2 (18 case). Đặc biệt:
- Test cold-start với device locale = `en` (Android Studio: Settings → Languages → English).
- Test offline + offline restart không mất locale (SecureStore persist).
- Test notification realtime đổi locale → UI rerender ngay không phải pull-to-refresh.
- Test backward compat: notification cũ trong DB (title đã set VN) vẫn hiển thị OK.
- Test edge case: tạo group → tạo trip với currency khác group default → trip hoạt động độc lập.
- Test currency picker chỉ visible khi user EXPAND (default collapsed) ở form tạo trip.

## Out of scope (làm sau)

- Thêm ngôn ngữ `ja`, `ko`, `id` (sẽ làm Phase 2 sau khi vi+en stable).
- Exchange rate / convert giữa currencies cùng group dashboard.
- Email template Supabase (reset password) đa ngôn ngữ — chỉnh trong Dashboard, không qua code.
- RTL languages (Arabic, Hebrew) — refactor layout sang `marginStart`/`marginEnd` là effort riêng.
- Cleanup hoàn toàn `_format_dedup_title` SQL function (giữ deprecated trong phase này, xóa sau 60 ngày khi notification cũ TTL hết).
- Migrate data notification cũ sang client-render format (giữ nguyên VN, acceptable).
