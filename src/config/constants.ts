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

// Database
export const DB_NAME = 'fairpay.db';

// Sync
export const SYNC_RETRY_MAX = 3;
export const SYNC_CLEANUP_AFTER_HOURS = 24;
