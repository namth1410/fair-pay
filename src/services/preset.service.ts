import type { ExpenseCategory } from '../config/constants';
import { supabase } from '../config/supabase';
import type { ExpensePresetRow } from '../types/database.types';
import { validateAmount } from '../utils/split';
import { validateName } from '../utils/validate';
import { getAuthUserId } from './auth.helper';

export type ExpensePreset = ExpensePresetRow;

/** Lấy preset của user hiện tại. */
export async function fetchPresets(): Promise<ExpensePreset[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('expense_presets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Tạo preset mới cho user hiện tại. `UNIQUE(user_id, title)` — trùng tên sẽ throw. */
export async function createPreset(params: {
  title: string;
  amount: number;
  category: ExpenseCategory;
}): Promise<ExpensePreset> {
  const titleErr = validateName(params.title, 'Tên preset');
  if (titleErr) throw new Error(titleErr);
  const amountErr = validateAmount(params.amount);
  if (amountErr) throw new Error(amountErr);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('expense_presets')
    .insert({
      user_id: userId,
      title: params.title.trim(),
      amount: params.amount,
      category: params.category,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Đã có preset trùng tên');
    throw error;
  }
  return data;
}

/** Xóa preset — RLS + app-level check đảm bảo chỉ owner xóa được. */
export async function deletePreset(presetId: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { error } = await supabase
    .from('expense_presets')
    .delete()
    .eq('id', presetId)
    .eq('user_id', userId);

  if (error) throw error;
}
