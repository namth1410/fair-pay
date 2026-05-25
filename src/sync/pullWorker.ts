// PullWorker — delta pull cho từng bảng theo watermark `updated_at`.
//
// Cycle 1 table:
//   1. Get watermark từ _sync_state
//   2. SELECT * FROM <table> WHERE updated_at > watermark (RLS filter member/owner)
//   3. Upsert vào SQLite qua repo.upsertFromServer()
//   4. Update watermark = max(rows.updated_at)
//
// Bảng đặc biệt:
//   - expense_splits: không có updated_at — pull theo expense_id IN changed_expense_ids.
//   - settlements: dùng generated_at làm watermark.
//   - audit_logs: append-only, dùng created_at.
//
// Phase 1c: pull-only, không có protect-pending logic. Phase 2 sẽ thêm
// check `hasPendingForEntity` để tránh ghi đè local pending writes.

import { supabase } from '../config/supabase';
import {
  auditLogRepo,
  expenseRepo,
  groupInvitationRepo,
  groupMemberRepo,
  groupRepo,
  notificationRepo,
  paymentRepo,
  pinnedTripRepo,
  presetRepo,
  settlementRepo,
  tripRepo,
  userRepo,
} from '../repositories';
import { upsertBatch } from '../repositories/_shared';
import type {
  AuditLogRow,
  ExpensePresetRow,
  ExpenseRow,
  ExpenseSplitRow,
  GroupInvitationRow,
  GroupMemberRow,
  GroupRow,
  NotificationRow,
  PaymentRow,
  PinnedTripRow,
  SettlementRow,
  TripRow,
  UserRow,
} from '../types/database.types';
import * as syncErrors from './syncErrors';
import * as syncState from './syncState';
import type { SyncedTable } from './syncState';

const PAGE_SIZE = 500;

interface PullStats {
  table: SyncedTable | 'expense_splits';
  fetched: number;
  newWatermark: string | null;
}

/**
 * Lấy max(updated_at) hoặc max(generated_at) từ batch rows. Trả về null nếu rỗng.
 */
function maxTimestamp<T>(rows: T[], field: keyof T): string | null {
  let max: string | null = null;
  for (const r of rows) {
    const v = r[field] as unknown as string | null | undefined;
    if (!v) continue;
    if (max === null || v > max) max = v;
  }
  return max;
}

async function pullPaginated<T>(
  table: string,
  tsField: string,
  watermark: string | null
): Promise<T[]> {
  // Pull page-by-page nếu lượng row > PAGE_SIZE. Supabase tự cap range nhưng để
  // safe ta order theo updated_at ASC + range, dùng updated_at của row cuối làm
  // cursor cho page kế.
  const all: T[] = [];
  let cursor = watermark;
  while (true) {
    let query = supabase
      .from(table)
      .select('*')
      .order(tsField, { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) {
      query = query.gt(tsField, cursor);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    const last = data[data.length - 1] as Record<string, unknown>;
    const nextCursor = last[tsField] as string | undefined;
    if (!nextCursor || nextCursor === cursor) break; // safety
    cursor = nextCursor;
  }
  return all;
}

// ─── Per-table pullers ──────────────────────────────────────────────────────

async function pullUsers(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('users');
  const rows = await pullPaginated<UserRow>('users', 'updated_at', watermark);
  for (const r of rows) await userRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('users', newWm);
  return { table: 'users', fetched: rows.length, newWatermark: newWm };
}

async function pullGroups(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('groups');
  const rows = await pullPaginated<GroupRow>('groups', 'updated_at', watermark);
  for (const r of rows) await groupRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('groups', newWm);
  return { table: 'groups', fetched: rows.length, newWatermark: newWm };
}

async function pullGroupMembers(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('group_members');
  const rows = await pullPaginated<GroupMemberRow>(
    'group_members',
    'updated_at',
    watermark
  );
  for (const r of rows) await groupMemberRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('group_members', newWm);
  return { table: 'group_members', fetched: rows.length, newWatermark: newWm };
}

async function pullTrips(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('trips');
  const rows = await pullPaginated<TripRow>('trips', 'updated_at', watermark);
  for (const r of rows) await tripRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('trips', newWm);
  return { table: 'trips', fetched: rows.length, newWatermark: newWm };
}

async function pullExpenses(): Promise<{
  expenses: PullStats;
  splits: PullStats;
}> {
  const watermark = await syncState.getWatermark('expenses');
  const expenseRows = await pullPaginated<ExpenseRow>(
    'expenses',
    'updated_at',
    watermark
  );
  for (const r of expenseRows) await expenseRepo.upsertFromServer(r);
  const newWm = maxTimestamp(expenseRows, 'updated_at');
  if (newWm) await syncState.setWatermark('expenses', newWm);

  // Splits: pull theo expense_id IN changed_expense_ids.
  // Splits không có updated_at — phải re-fetch toàn bộ splits của expense thay đổi.
  // KHÔNG batch quá lớn để tránh URL too long.
  let splitsFetched = 0;
  if (expenseRows.length > 0) {
    const expenseIds = expenseRows.map((e) => e.id);
    const CHUNK = 50;
    for (let i = 0; i < expenseIds.length; i += CHUNK) {
      const chunk = expenseIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('expense_splits')
        .select('*')
        .in('expense_id', chunk);
      if (error) throw error;
      if (data && data.length > 0) {
        // Replace local splits cho mỗi expense (server là source of truth)
        // Strategy: delete + upsert trong transaction.
        await upsertBatch(
          'expense_splits',
          (data as ExpenseSplitRow[]).map((r) => ({
            id: r.id,
            expense_id: r.expense_id,
            member_id: r.member_id,
            amount: r.amount,
          }))
        );
        splitsFetched += data.length;
      }
    }
  }

  return {
    expenses: { table: 'expenses', fetched: expenseRows.length, newWatermark: newWm },
    splits: { table: 'expense_splits', fetched: splitsFetched, newWatermark: null },
  };
}

async function pullPayments(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('payments');
  const rows = await pullPaginated<PaymentRow>(
    'payments',
    'updated_at',
    watermark
  );
  for (const r of rows) await paymentRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('payments', newWm);
  return { table: 'payments', fetched: rows.length, newWatermark: newWm };
}

async function pullPresets(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('expense_presets');
  const rows = await pullPaginated<ExpensePresetRow>(
    'expense_presets',
    'updated_at',
    watermark
  );
  for (const r of rows) await presetRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('expense_presets', newWm);
  return {
    table: 'expense_presets',
    fetched: rows.length,
    newWatermark: newWm,
  };
}

async function pullPinnedTrips(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('pinned_trips');
  const rows = await pullPaginated<PinnedTripRow>(
    'pinned_trips',
    'updated_at',
    watermark
  );
  for (const r of rows) await pinnedTripRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('pinned_trips', newWm);
  return { table: 'pinned_trips', fetched: rows.length, newWatermark: newWm };
}

async function pullAuditLogs(): Promise<PullStats> {
  // Audit append-only — dùng created_at làm watermark
  const watermark = await syncState.getWatermark('audit_logs');
  const rows = await pullPaginated<AuditLogRow>(
    'audit_logs',
    'created_at',
    watermark
  );
  for (const r of rows) await auditLogRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'created_at');
  if (newWm) await syncState.setWatermark('audit_logs', newWm);
  return { table: 'audit_logs', fetched: rows.length, newWatermark: newWm };
}

async function pullSettlements(): Promise<PullStats> {
  // Settlements computed server-side. Pull theo generated_at.
  const watermark = await syncState.getWatermark('settlements');
  const rows = await pullPaginated<SettlementRow>(
    'settlements',
    'generated_at',
    watermark
  );
  for (const r of rows) await settlementRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'generated_at');
  if (newWm) await syncState.setWatermark('settlements', newWm);
  return { table: 'settlements', fetched: rows.length, newWatermark: newWm };
}

async function pullNotifications(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('notifications');
  const rows = await pullPaginated<NotificationRow>(
    'notifications',
    'updated_at',
    watermark
  );
  for (const r of rows) await notificationRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('notifications', newWm);
  return { table: 'notifications', fetched: rows.length, newWatermark: newWm };
}

async function pullGroupInvitations(): Promise<PullStats> {
  const watermark = await syncState.getWatermark('group_invitations');
  const rows = await pullPaginated<GroupInvitationRow>(
    'group_invitations',
    'updated_at',
    watermark
  );
  for (const r of rows) await groupInvitationRepo.upsertFromServer(r);
  const newWm = maxTimestamp(rows, 'updated_at');
  if (newWm) await syncState.setWatermark('group_invitations', newWm);
  return {
    table: 'group_invitations',
    fetched: rows.length,
    newWatermark: newWm,
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

export interface PullResult {
  totalFetched: number;
  stats: PullStats[];
  errors: Array<{ table: string; message: string }>;
}

/**
 * Pull tất cả bảng theo thứ tự: users → groups → group_members → trips →
 * expenses (+splits) → payments → presets → pinned_trips → audit_logs →
 * settlements → notifications → group_invitations.
 *
 * Mỗi bảng pull độc lập — 1 table fail không block các table khác. Errors
 * collected vào result.errors. Caller (syncEngine) quyết định toast hay log.
 */
export async function pullAll(): Promise<PullResult> {
  const stats: PullStats[] = [];
  const errors: Array<{ table: string; message: string }> = [];

  const safe = async <T>(table: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      const e = err as { message?: string; code?: string; details?: string; hint?: string };
      const message = e?.message ?? String(err) ?? 'unknown';
      const code = e?.code ?? null;
      errors.push({ table, message });
      if (__DEV__) console.warn(`[pull] ${table} failed:`, message);
      // Persist vào _sync_errors để debug được lần sau không cần adb logcat
      // (vd hiện tại pullGroups/pullUsers/pullGroupMembers stuck watermark
      // nhiều ngày — không có vết để tìm root cause).
      void syncErrors.log({
        source: `pull:${table}`,
        code,
        message,
        context: { details: e?.details ?? null, hint: e?.hint ?? null },
      });
      return null;
    }
  };

  const u = await safe('users', pullUsers);
  if (u) stats.push(u);

  const g = await safe('groups', pullGroups);
  if (g) stats.push(g);

  const gm = await safe('group_members', pullGroupMembers);
  if (gm) stats.push(gm);

  const t = await safe('trips', pullTrips);
  if (t) stats.push(t);

  const e = await safe('expenses', pullExpenses);
  if (e) {
    stats.push(e.expenses);
    stats.push(e.splits);
  }

  const p = await safe('payments', pullPayments);
  if (p) stats.push(p);

  const pr = await safe('expense_presets', pullPresets);
  if (pr) stats.push(pr);

  const pt = await safe('pinned_trips', pullPinnedTrips);
  if (pt) stats.push(pt);

  const al = await safe('audit_logs', pullAuditLogs);
  if (al) stats.push(al);

  const st = await safe('settlements', pullSettlements);
  if (st) stats.push(st);

  const n = await safe('notifications', pullNotifications);
  if (n) stats.push(n);

  const gi = await safe('group_invitations', pullGroupInvitations);
  if (gi) stats.push(gi);

  const totalFetched = stats.reduce((acc, s) => acc + s.fetched, 0);
  return { totalFetched, stats, errors };
}
