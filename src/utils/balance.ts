/**
 * Pure function tính số dư (balance) từng thành viên.
 *
 * Được dùng chung bởi:
 * - expense.service.ts (production — gọi Supabase rồi truyền data vào)
 * - balance.test.ts (unit test — truyền mock data trực tiếp)
 *
 * Công thức (Section 5, business-requirements.md):
 * balance[member] =
 *   + Σ expense.amount (khoản chi member đã trả)
 *   - Σ split.amount (phần member phải chịu)
 *   + Σ payment.amount WHERE to = member (đã nhận)
 *   - Σ payment.amount WHERE from = member (đã trả đi)
 */

export interface ExpenseData {
  paidBy: string;
  amount: number;
  splits: { memberId: string; amount: number }[];
}

export interface PaymentData {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

export interface BalanceResult {
  memberId: string;
  memberName: string;
  balance: number;
}

/**
 * Tính balance cho từng thành viên — pure function, không gọi API.
 *
 * @param members - Danh sách thành viên { id, displayName }
 * @param expenses - Danh sách khoản chi với splits
 * @param payments - Danh sách thanh toán thực tế
 * @returns Mảng BalanceResult, Σ balance = 0 (TC-05)
 */
export function computeBalances(
  members: { id: string; displayName: string }[],
  expenses: ExpenseData[],
  payments: PaymentData[]
): BalanceResult[] {
  const balanceMap: Record<string, number> = {};
  members.forEach((m) => {
    balanceMap[m.id] = 0;
  });

  // Expenses: payer gets credit, split members owe
  for (const exp of expenses) {
    if (exp.paidBy in balanceMap) {
      balanceMap[exp.paidBy] = balanceMap[exp.paidBy]! + exp.amount;
    }
    for (const split of exp.splits) {
      if (split.memberId in balanceMap) {
        balanceMap[split.memberId] = balanceMap[split.memberId]! - split.amount;
      }
    }
  }

  // Payments: sender settles debt (balance UP), receiver gets paid back (balance DOWN)
  for (const pay of payments) {
    if (pay.fromMemberId in balanceMap) {
      balanceMap[pay.fromMemberId] = balanceMap[pay.fromMemberId]! + pay.amount;
    }
    if (pay.toMemberId in balanceMap) {
      balanceMap[pay.toMemberId] = balanceMap[pay.toMemberId]! - pay.amount;
    }
  }

  return members.map((m) => ({
    memberId: m.id,
    memberName: m.displayName,
    balance: balanceMap[m.id] ?? 0,
  }));
}

/**
 * Overload: tính balance từ plain arrays (backward compatible với test cũ).
 * memberIds dùng luôn làm displayName.
 */
export function computeBalancesSimple(
  memberIds: string[],
  expenses: ExpenseData[],
  payments: PaymentData[]
): Record<string, number> {
  const members = memberIds.map((id) => ({ id, displayName: id }));
  const results = computeBalances(members, expenses, payments);
  const map: Record<string, number> = {};
  results.forEach((r) => {
    map[r.memberId] = r.balance;
  });
  return map;
}
