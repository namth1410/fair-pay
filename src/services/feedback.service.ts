import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { supabase } from '../config/supabase';
import { getAuthUserId } from './auth.helper';

export const FEEDBACK_MAX_LENGTH = 1000;
export const FEEDBACK_MIN_LENGTH = 3;

const COOLDOWN_KEY = 'fair_pay_feedback_last_sent';
const COOLDOWN_MS = 30_000;

// Loại bỏ ký tự điều khiển (NUL, BEL, BS, v.v.) — giữ \n và \t. Chống "null byte injection"
// và các ký tự ẩn có thể phá format/log/admin terminal khi đọc về sau.
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
// Gom nhiều dòng trống liên tiếp lại tối đa 2 newline → tránh DoS bằng spam newline.
const EXCESS_NEWLINES_RE = /\n{3,}/g;

export function sanitizeFeedback(input: string): string {
  return input
    .replace(CONTROL_CHARS_RE, '')
    .replace(EXCESS_NEWLINES_RE, '\n\n')
    .trim();
}

export async function getFeedbackCooldownRemaining(): Promise<number> {
  const raw = await SecureStore.getItemAsync(COOLDOWN_KEY);
  if (!raw) return 0;
  const last = Number(raw);
  if (!Number.isFinite(last)) return 0;
  const elapsed = Date.now() - last;
  if (elapsed >= COOLDOWN_MS) return 0;
  return Math.ceil((COOLDOWN_MS - elapsed) / 1000);
}

async function markFeedbackSent(): Promise<void> {
  await SecureStore.setItemAsync(COOLDOWN_KEY, String(Date.now()));
}

export async function submitFeedback(message: string): Promise<void> {
  const cleaned = sanitizeFeedback(message);

  if (cleaned.length < FEEDBACK_MIN_LENGTH) {
    throw new Error(`Góp ý quá ngắn (tối thiểu ${FEEDBACK_MIN_LENGTH} ký tự)`);
  }
  if (cleaned.length > FEEDBACK_MAX_LENGTH) {
    throw new Error(`Góp ý quá dài (tối đa ${FEEDBACK_MAX_LENGTH} ký tự)`);
  }

  const remaining = await getFeedbackCooldownRemaining();
  if (remaining > 0) {
    throw new Error(`Vui lòng chờ ${remaining}s trước khi gửi góp ý tiếp`);
  }

  const userId = await getAuthUserId();
  if (!userId) {
    throw new Error('Chưa đăng nhập');
  }

  const appVersion = Constants.expoConfig?.version ?? null;
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    message: cleaned,
    app_version: appVersion,
    platform: Platform.OS,
  });
  if (error) throw error;

  await markFeedbackSent();
}
