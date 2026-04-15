import { supabase } from '../config/supabase';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  fcm_token: string | null;
  settings: UserSettings;
}

export interface UserSettings {
  dark_mode: 'system' | 'light' | 'dark';
  notify_expense: boolean;
  notify_reminder: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dark_mode: 'system',
  notify_expense: true,
  notify_reminder: true,
};

/** Fetch current user profile from users table */
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email || user.email || '',
    display_name: data.display_name || 'Chưa đặt tên',
    photo_url: data.photo_url || null,
    fcm_token: data.fcm_token || null,
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
  };
}

/** Update display name */
export async function updateDisplayName(name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tên không được để trống');

  const { error } = await supabase
    .from('users')
    .update({ display_name: trimmed })
    .eq('id', user.id);

  if (error) throw error;

  // Also update Supabase auth metadata
  await supabase.auth.updateUser({
    data: { display_name: trimmed },
  });
}

/** Update user settings (notification preferences, dark mode, etc.) */
export async function updateSettings(settings: UserSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Chưa đăng nhập');

  const { error } = await supabase
    .from('users')
    .update({ settings })
    .eq('id', user.id);

  if (error) throw error;
}

/** Update FCM token for push notifications */
export async function updateFcmToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('users')
    .update({ fcm_token: token })
    .eq('id', user.id);

  if (error) console.warn('[User] Failed to update FCM token:', error.message);
}
