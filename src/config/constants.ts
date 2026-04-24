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

// User
export const DISPLAY_NAME_MAX_LENGTH = 30;

// Sync
export const SYNC_RETRY_MAX = 3;
export const SYNC_CLEANUP_AFTER_HOURS = 24;

// Expense categories — shared single source of truth
export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'fun'
  | 'shopping'
  | 'other';

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'food', label: 'Ăn uống' },
  { key: 'transport', label: 'Di chuyển' },
  { key: 'accommodation', label: 'Chỗ ở' },
  { key: 'fun', label: 'Vui chơi' },
  { key: 'shopping', label: 'Mua sắm' },
  { key: 'other', label: 'Khác' },
];
