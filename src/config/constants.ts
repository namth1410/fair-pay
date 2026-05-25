export const APP_NAME = 'Fair Pay';
export const APP_SLOGAN = 'Chia tiền · Không chia rẽ';
export const APP_SCHEME = 'fairpay';

// Supabase
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error(
    'Thiếu EXPO_PUBLIC_SUPABASE_URL hoặc EXPO_PUBLIC_SUPABASE_ANON_KEY trong .env'
  );
}

// Google Sign-In (native)
// Web Client ID — `aud` claim của ID token trả về từ native GoogleSignin
// phải khớp với giá trị này để Supabase verify thành công.
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

if (__DEV__ && !GOOGLE_WEB_CLIENT_ID) {
  console.warn(
    '[constants] Thiếu EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — Google Sign-In sẽ fail'
  );
}

// Database
export const DB_NAME = 'fairpay.db';

// User
export const DISPLAY_NAME_MAX_LENGTH = 30;

// Trip
export const TRIP_NAME_MAX_LENGTH = 50;

// Pinned trips (home shortcut)
export const MAX_PINNED_TRIPS = 2;

// Sync
export const SYNC_RETRY_MAX = 3;
export const SYNC_CLEANUP_AFTER_HOURS = 24;

// Group avatar (Cloudflare R2 storage)
export const GROUP_AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB sau compress
export const GROUP_AVATAR_QUOTA_PER_GROUP_PER_WEEK = 3;
export const GROUP_AVATAR_QUOTA_PER_USER_PER_DAY = 20;
export const R2_PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_R2_PUBLIC_BASE_URL ?? '';

// Expense image (Cloudflare R2 — bucket dùng chung với avatar, prefix khác)
export const EXPENSE_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const EXPENSE_IMAGE_QUOTA_PER_USER_PER_DAY = 100;
export const EXPENSE_IMAGE_QUOTA_PER_GROUP_PER_DAY = 50;

// Notifications
export const NOTIF_PAGE_SIZE = 30;
export const NOTIF_DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 phút — gộp duplicate notif chưa đọc
export const SETTLE_SUGGEST_MIN_AMOUNT = 200_000;     // VND — ngưỡng gợi ý settle
export const SETTLE_SUGGEST_AGE_DAYS = 3;             // số ngày trip không hoạt động trước khi gợi ý
export const SETTLE_SUGGEST_COOLDOWN_DAYS = 7;        // không gửi lại settle suggest cùng cặp trong N ngày
