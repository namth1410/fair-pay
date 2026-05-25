import { supabase } from '../config/supabase';
import { getDatabase } from '../db/database';
import { useAppStore } from '../stores/app.store';
import { tryServerThenLocal } from '../sync/fallback';
import * as syncQueue from '../sync/syncQueue';
import { ENTITY_TYPES, OP_TYPES } from '../sync/types';
import type { ExpensePresetRow, PresetSplitEntry } from '../types/database.types';
import { isNetworkError } from '../utils/network';
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

/** Lấy preset của user hiện tại, sort theo updated_at DESC. Fallback SQLite mirror. */
export async function fetchPresets(): Promise<ExpensePreset[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  return tryServerThenLocal<ExpensePreset[]>(
    async () => {
      const { data, error } = await supabase
        .from('expense_presets')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const db = getDatabase();
      const rows = await db.getAllAsync<ExpensePresetRow>(
        `SELECT * FROM expense_presets
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC`,
        [userId]
      );
      // Splits stored as JSON text in SQLite → parse
      return rows.map((r) => {
        const raw = (r as unknown as { splits_data: unknown }).splits_data;
        let splits_data: PresetSplitEntry[] | null = null;
        if (typeof raw === 'string') {
          try {
            splits_data = JSON.parse(raw) as PresetSplitEntry[];
          } catch {
            splits_data = null;
          }
        } else if (raw && typeof raw === 'object') {
          splits_data = raw as PresetSplitEntry[];
        }
        return { ...r, splits_data };
      });
    }
  );
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

  const presetId = globalThis.crypto.randomUUID();
  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();
  const title = params.title.trim();

  const buildRow = (): ExpensePreset => ({
    id: presetId,
    user_id: userId,
    title,
    amount: params.amount,
    category: 'other',
    trip_id: params.tripId ?? null,
    paid_by_member_id: params.paidByMemberId ?? null,
    split_type: params.splitType ?? null,
    splits_data: params.splitsData ?? null,
    version: 1,
    client_request_id: clientRequestId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  const enqueueLocal = async (): Promise<ExpensePreset> => {
    const db = getDatabase();
    await db.runAsync(
      `INSERT INTO expense_presets
        (id, user_id, title, amount, category, trip_id, paid_by_member_id,
         split_type, splits_data, version, client_request_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'other', ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        presetId,
        userId,
        title,
        params.amount,
        params.tripId ?? null,
        params.paidByMemberId ?? null,
        params.splitType ?? null,
        params.splitsData ? JSON.stringify(params.splitsData) : null,
        clientRequestId,
        now,
        now,
      ]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.CREATE_PRESET,
      entity_type: ENTITY_TYPES.PRESET,
      entity_id: presetId,
      client_request_id: clientRequestId,
      payload: {
        id: presetId,
        user_id: userId,
        title,
        amount: params.amount,
        category: 'other',
        trip_id: params.tripId ?? null,
        paid_by_member_id: params.paidByMemberId ?? null,
        split_type: params.splitType ?? null,
        splits_data: params.splitsData ?? null,
        client_request_id: clientRequestId,
        client_created_at: now,
      },
    });
    return buildRow();
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const { data, error } = await supabase
      .from('expense_presets')
      .insert({
        id: presetId,
        user_id: userId,
        title,
        amount: params.amount,
        category: 'other',
        trip_id: params.tripId ?? null,
        paid_by_member_id: params.paidByMemberId ?? null,
        split_type: params.splitType ?? null,
        splits_data: params.splitsData ?? null,
        client_request_id: clientRequestId,
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
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[createPreset] network fail, queueing offline');
      return enqueueLocal();
    }
    throw err;
  }
}

/**
 * Cập nhật preset. Không cascade vào expense đã dùng (preset chỉ là template).
 * Offline-first: RPC update_preset với version optimistic concurrency.
 */
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

  const db = getDatabase();
  const local = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM expense_presets WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [presetId, userId]
  );
  if (!local) throw new Error('Preset không tồn tại');

  const title = params.title.trim();
  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<ExpensePreset> => {
    await db.runAsync(
      `UPDATE expense_presets
          SET title = ?, amount = ?, trip_id = ?, paid_by_member_id = ?,
              split_type = ?, splits_data = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND user_id = ?`,
      [
        title,
        params.amount,
        params.tripId ?? null,
        params.paidByMemberId ?? null,
        params.splitType ?? null,
        params.splitsData ? JSON.stringify(params.splitsData) : null,
        now,
        presetId,
        userId,
      ]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.UPDATE_PRESET,
      entity_type: ENTITY_TYPES.PRESET,
      entity_id: presetId,
      client_request_id: clientRequestId,
      payload: {
        preset_id: presetId,
        title,
        amount: params.amount,
        category: 'other',
        trip_id: params.tripId ?? null,
        paid_by_member_id: params.paidByMemberId ?? null,
        split_type: params.splitType ?? null,
        splits_data: params.splitsData ?? null,
        base_version: local.version,
        client_request_id: clientRequestId,
      },
    });
    const updated = await db.getFirstAsync<ExpensePresetRow>(
      `SELECT * FROM expense_presets WHERE id = ?`,
      [presetId]
    );
    return updated as ExpensePreset;
  };

  if (!useAppStore.getState().isOnline) {
    return enqueueLocal();
  }

  try {
    const { data, error } = await supabase.rpc('update_preset', {
      p_preset_id: presetId,
      p_title: title,
      p_amount: params.amount,
      p_category: 'other',
      p_trip_id: params.tripId ?? null,
      p_paid_by_member_id: params.paidByMemberId ?? null,
      p_split_type: params.splitType ?? null,
      p_splits_data: params.splitsData ?? null,
      p_base_version: local.version,
      p_client_request_id: clientRequestId,
    });
    if (error) {
      if (error.code === '23505') {
        throw new Error('Đã có preset trùng tên trong phạm vi này');
      }
      throw error;
    }
    // RPC returns rows array — take first
    return Array.isArray(data) && data.length > 0
      ? (data[0] as ExpensePreset)
      : ({} as ExpensePreset);
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[updatePreset] network fail, queueing offline');
      return enqueueLocal();
    }
    throw err;
  }
}

/**
 * Soft-delete preset. Offline-first: idempotent qua deleted_at COALESCE.
 * Server-side cũng dùng UPDATE deleted_at thay vì DELETE row.
 */
export async function deletePreset(presetId: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  const clientRequestId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  const enqueueLocal = async (): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
      `UPDATE expense_presets
          SET deleted_at = COALESCE(deleted_at, ?)
        WHERE id = ? AND user_id = ?`,
      [now, presetId, userId]
    );
    await syncQueue.enqueue({
      op_type: OP_TYPES.DELETE_PRESET,
      entity_type: ENTITY_TYPES.PRESET,
      entity_id: presetId,
      client_request_id: clientRequestId,
      payload: {
        preset_id: presetId,
        client_request_id: clientRequestId,
        client_created_at: now,
      },
    });
  };

  if (!useAppStore.getState().isOnline) {
    await enqueueLocal();
    return;
  }

  try {
    const { error } = await supabase
      .from('expense_presets')
      .update({ deleted_at: now })
      .eq('id', presetId)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw error;
  } catch (err) {
    if (isNetworkError(err)) {
      if (__DEV__) console.warn('[deletePreset] network fail, queueing offline');
      await enqueueLocal();
      return;
    }
    throw err;
  }
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
