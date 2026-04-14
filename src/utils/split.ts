/**
 * Split logic — BR-01: integer only, round to 1000đ, remainder to first person.
 * BR-02: total splits must equal expense amount.
 */

export interface SplitResult {
  memberId: string;
  amount: number; // integer VND
}

/** Equal split: round to nearest 1000đ, last person absorbs remainder */
export function splitEqual(total: number, memberIds: string[]): SplitResult[] {
  const n = memberIds.length;
  if (n === 0) return [];

  // Round to nearest 1000đ (BR-01)
  const perPerson = Math.round(total / n / 1000) * 1000;
  // Last person gets whatever remains to ensure sum = total (BR-02)
  const lastPerson = total - perPerson * (n - 1);

  return memberIds.map((memberId, i) => ({
    memberId,
    amount: i < n - 1 ? perPerson : lastPerson,
  }));
}

/** Custom split: validate that total matches */
export function validateSplits(
  total: number,
  splits: SplitResult[]
): string | null {
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== total) {
    return `Tổng chia (${sum.toLocaleString('vi-VN')}đ) khác tổng khoản chi (${total.toLocaleString('vi-VN')}đ)`;
  }
  if (splits.some((s) => s.amount < 0)) {
    return 'Số tiền không được âm';
  }
  return null; // valid
}
