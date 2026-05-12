import { supabase } from '../config/supabase';
import type { ExpensePresetRow, PresetSplitEntry } from '../types/database.types';
import {
  splitByRatio,
  splitEqual,
  type SplitResult,
  validateAmount,
} from '../utils/split';
import { validateName } from '../utils/validate';
import { getAuthUserId } from './auth.helper';

export type ExpensePreset = ExpensePresetRow;
export type { PresetSplitEntry };

export type PresetSplitType = 'equal' | 'ratio' | 'custom';

export interface PresetCreateParams {
  title: string;
  amount: number;
  tripId?: string | null;
  paidByMemberId?: string | null;
  splitType?: PresetSplitType | null;
  splitsData?: PresetSplitEntry[] | null;
}

function validateScope(params: PresetCreateParams): void {
  const paidBy = params.paidByMemberId ?? null;
  const splitType = params.splitType ?? null;
  const splitsData = params.splitsData ?? null;
  const tripId = params.tripId ?? null;

  const hasPaidBy = paidBy !== null;
  const hasSplitType = splitType !== null;
  const hasSplitsData = splitsData !== null;
  const hasSplits = hasSplitType || hasSplitsData;

  if (tripId === null && (hasPaidBy || hasSplits)) {
    throw new Error('Preset paid_by/splits chỉ áp dụng khi gắn với chuyến đi');
  }
  if (hasSplitType !== hasSplitsData) {
    throw new Error('split_type và splits_data phải đi cùng nhau');
  }
  if (splitsData && splitsData.length === 0) {
    throw new Error('Danh sách thành viên chia không được rỗng');
  }
  if (splitsData && splitType === 'ratio') {
    if (splitsData.some((s) => (s.ratio ?? 0) <= 0)) {
      throw new Error('Mỗi thành viên phải có tỷ lệ > 0');
    }
  }
  if (splitsData && splitType === 'custom') {
    if (splitsData.some((s) => (s.amount ?? -1) < 0)) {
      throw new Error('Mỗi thành viên phải có số tiền >= 0');
    }
    const sum = splitsData.reduce((acc, s) => acc + (s.amount ?? 0), 0);
    if (sum !== params.amount) {
      throw new Error(`Tổng chia (${sum.toLocaleString('vi-VN')}đ) khác số tiền preset (${params.amount.toLocaleString('vi-VN')}đ)`);
    }
  }
}

/** Lấy preset của user hiện tại, sort theo updated_at DESC (mới cập nhật ở đầu). */
export async function fetchPresets(): Promise<ExpensePreset[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('expense_presets')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Tạo preset mới. 2 scope:
 *  - Global: không trip_id → lưu {title, amount}
 *  - Trip-pinned: có trip_id → có thể lưu thêm paid_by + splits (optional)
 *
 * Constraints DB:
 *  - paid_by/splits chỉ valid khi trip_id set (preset_scope_consistency)
 *  - split_type & splits_data phải đi cùng (preset_splits_pair)
 *  - Unique title trong phạm vi (global vs trip-scope)
 */
export async function createPreset(params: PresetCreateParams): Promise<ExpensePreset> {
  const titleErr = validateName(params.title, 'Tên preset');
  if (titleErr) throw new Error(titleErr);
  const amountErr = validateAmount(params.amount);
  if (amountErr) throw new Error(amountErr);
  validateScope(params);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('expense_presets')
    .insert({
      user_id: userId,
      title: params.title.trim(),
      amount: params.amount,
      category: 'other',
      trip_id: params.tripId ?? null,
      paid_by_member_id: params.paidByMemberId ?? null,
      split_type: params.splitType ?? null,
      splits_data: params.splitsData ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Đã có preset trùng tên trong phạm vi này');
    }
    throw error;
  }
  return data;
}

/** Cập nhật preset. Không cascade vào expense đã dùng (preset chỉ là template). */
export async function updatePreset(
  presetId: string,
  params: PresetCreateParams,
): Promise<ExpensePreset> {
  const titleErr = validateName(params.title, 'Tên preset');
  if (titleErr) throw new Error(titleErr);
  const amountErr = validateAmount(params.amount);
  if (amountErr) throw new Error(amountErr);
  validateScope(params);

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data, error } = await supabase
    .from('expense_presets')
    .update({
      title: params.title.trim(),
      amount: params.amount,
      trip_id: params.tripId ?? null,
      paid_by_member_id: params.paidByMemberId ?? null,
      split_type: params.splitType ?? null,
      splits_data: params.splitsData ?? null,
    })
    .eq('id', presetId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Đã có preset trùng tên trong phạm vi này');
    }
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

/**
 * Preset được gọi là "full" khi đủ paid_by + splits → cho phép 1-tap submit qua confirm dialog.
 * "Partial" trip-pinned thiếu paid_by hoặc splits → mở form pre-fill.
 */
export function isFullPreset(preset: ExpensePreset): boolean {
  return (
    preset.trip_id !== null &&
    preset.paid_by_member_id !== null &&
    preset.split_type !== null &&
    preset.splits_data !== null
  );
}

export interface PresetApplyResult {
  paidByMemberId: string;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: SplitResult[];
  warnings: string[];
  /** true nếu preset có data nhưng phải fallback do member rời/thiếu */
  hasFallback: boolean;
  /** thông tin tham khảo */
  tripGroupId: string;
}

/**
 * Apply preset vào trip: validate paid_by/splits members còn active, fallback nếu stale.
 *
 * Hành vi:
 *  - paid_by_member_id rời nhóm → fallback current user, warning.
 *  - Bất kỳ member trong splits_data rời nhóm → fallback chia đều all active members, warning.
 *  - Member mới trong trip không có trong splits → KHÔNG warning (preset chỉ chia cho members cũ).
 *  - Preset partial (thiếu paid_by hoặc splits) → fill phần thiếu = default (current user / chia đều).
 *
 * Resolve final amounts qua splitEqual/splitByRatio (custom dùng splits_data trực tiếp).
 *
 * Throw nếu: preset không gắn trip / trip không tồn tại / user không phải member của trip group.
 */
export async function applyPresetToTrip(
  preset: ExpensePreset,
  tripId: string,
): Promise<PresetApplyResult> {
  if (preset.trip_id !== null && preset.trip_id !== tripId) {
    throw new Error('Preset gắn với trip khác, không apply được');
  }

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('group_id')
    .eq('id', tripId)
    .single();
  if (tripErr || !trip) throw new Error('Chuyến đi không tồn tại');
  const groupId = trip.group_id as string;

  const { data: membersRaw, error: memErr } = await supabase
    .from('group_members')
    .select('id, user_id, display_name, left_at')
    .eq('group_id', groupId);
  if (memErr) throw memErr;

  const members = (membersRaw ?? []) as {
    id: string;
    user_id: string | null;
    display_name: string;
    left_at: string | null;
  }[];

  const activeMembers = members.filter((m) => m.left_at === null);
  const activeIds = new Set(activeMembers.map((m) => m.id));

  const currentUserMember = activeMembers.find((m) => m.user_id === userId);
  if (!currentUserMember) {
    throw new Error('Bạn không còn là thành viên của nhóm');
  }

  const warnings: string[] = [];
  let hasFallback = false;

  let paidByMemberId: string;
  if (preset.paid_by_member_id && activeIds.has(preset.paid_by_member_id)) {
    paidByMemberId = preset.paid_by_member_id;
  } else {
    if (preset.paid_by_member_id) {
      const old = members.find((m) => m.id === preset.paid_by_member_id);
      const name = old?.display_name ?? 'Người trả';
      warnings.push(`${name} đã rời nhóm, đặt người trả mặc định là bạn`);
      hasFallback = true;
    }
    paidByMemberId = currentUserMember.id;
  }

  let splitType: 'equal' | 'ratio' | 'custom';
  let splits: SplitResult[];

  const presetSplits = preset.splits_data;
  const presetSplitType = preset.split_type;
  const allPresetMembersActive =
    presetSplits !== null &&
    presetSplits.every((s) => activeIds.has(s.member_id));

  if (presetSplits !== null && presetSplitType !== null && allPresetMembersActive) {
    splitType = presetSplitType;
    if (presetSplitType === 'equal') {
      splits = splitEqual(
        preset.amount,
        presetSplits.map((s) => s.member_id),
      );
    } else if (presetSplitType === 'ratio') {
      splits = splitByRatio(
        preset.amount,
        presetSplits.map((s) => ({ memberId: s.member_id, ratio: s.ratio ?? 1 })),
      );
    } else {
      splits = presetSplits.map((s) => ({
        memberId: s.member_id,
        amount: s.amount ?? 0,
      }));
    }
  } else {
    if (presetSplits !== null) {
      warnings.push('Thành viên trong cách chia của preset đã thay đổi, đặt chia đều cho hiện tại');
      hasFallback = true;
    }
    splitType = 'equal';
    splits = splitEqual(
      preset.amount,
      activeMembers.map((m) => m.id),
    );
  }

  return {
    paidByMemberId,
    splitType,
    splits,
    warnings,
    hasFallback,
    tripGroupId: groupId,
  };
}
