// Build TripSnapshot từ SQLite local (app context) — tái dùng computeBalances +
// đúng reads mà trip.store.loadBalances dùng (members ALL kể cả đã rời để balance
// đúng, expenses kèm splits, payments).

import { initDatabase } from '../db/database';
import * as expenseRepo from '../repositories/expense.repo';
import * as groupRepo from '../repositories/group.repo';
import * as memberRepo from '../repositories/groupMember.repo';
import * as paymentRepo from '../repositories/payment.repo';
import * as tripRepo from '../repositories/trip.repo';
import { getAuthUserId } from '../services/auth.helper';
import { computeBalances } from '../utils/balance';
import type { TripSnapshot } from './widgetTypes';

/**
 * Trả null nếu: chưa đăng nhập, trip đã xóa, hoặc DB chưa sẵn sàng.
 * myBalance = số dư của user hiện tại; nếu user không còn là member → 0.
 */
export async function buildTripSnapshot(
  tripId: string
): Promise<TripSnapshot | null> {
  await initDatabase();
  const userId = await getAuthUserId();
  if (!userId) return null;

  const trip = await tripRepo.getById(tripId);
  if (!trip) return null;

  const [group, members, expenses, payments] = await Promise.all([
    groupRepo.getById(trip.groupId),
    memberRepo.listAllByGroup(trip.groupId),
    expenseRepo.listByTripWithSplits(tripId),
    paymentRepo.listByTrip(tripId),
  ]);

  const balances = computeBalances(
    members.map((m) => ({ id: m.id, displayName: m.displayName })),
    expenses.map((e) => ({
      paidBy: e.paidBy,
      amount: e.amount,
      splits: e.splits.map((s) => ({ memberId: s.memberId, amount: s.amount })),
    })),
    payments.map((p) => ({
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      amount: p.amount,
    }))
  );

  const me = members.find((m) => m.userId === userId);
  const myBalance = me
    ? balances.find((b) => b.memberId === me.id)?.balance ?? 0
    : 0;

  return {
    tripId,
    tripName: trip.name,
    groupName: group?.name ?? '',
    myBalance,
    updatedAt: new Date().toISOString(),
  };
}
