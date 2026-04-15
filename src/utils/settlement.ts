/**
 * Greedy Simplification Algorithm — BR-07: suggestions only.
 * Calculates optimal settlement transactions to minimize number of transfers.
 *
 * Fix: rounding sử dụng unrounded amounts để tính toán chính xác,
 * chỉ round kết quả cuối cùng. Điều chỉnh giao dịch cuối để bù sai số.
 */
export function calculateSettlements(
  balances: { memberId: string; memberName: string; balance: number }[]
): { from: string; fromName: string; to: string; toName: string; amount: number }[] {
  const TOLERANCE = 1000; // ±1000đ rounding tolerance

  // Separate creditors (balance > 0) and debtors (balance < 0)
  const creditors = balances
    .filter((b) => b.balance > TOLERANCE)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance); // descending

  const debtors = balances
    .filter((b) => b.balance < -TOLERANCE)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.balance - b.balance); // most negative first

  const transactions: { from: string; fromName: string; to: string; toName: string; amount: number }[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;

    // Use unrounded amount for calculation to prevent cumulative rounding loss
    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);

    // Update balances with unrounded amount first (accurate tracking)
    debtor.balance += amount;
    creditor.balance -= amount;

    // Round only the output transaction
    const rounded = Math.round(amount / 1000) * 1000;

    if (rounded > 0) {
      transactions.push({
        from: debtor.memberId,
        fromName: debtor.memberName,
        to: creditor.memberId,
        toName: creditor.memberName,
        amount: rounded,
      });
    }

    if (Math.abs(debtor.balance) <= TOLERANCE) i++;
    if (creditor.balance <= TOLERANCE) j++;
  }

  // Adjust last transaction to absorb rounding difference
  // This ensures total settlement ≈ total debt (minimize rounding loss)
  if (transactions.length > 0) {
    const totalDebt = balances
      .filter((b) => b.balance < -TOLERANCE)
      .reduce((sum, b) => sum + Math.abs(b.balance), 0);

    const totalSettlement = transactions.reduce((sum, t) => sum + t.amount, 0);
    const diff = Math.round(totalDebt / 1000) * 1000 - totalSettlement;

    if (diff !== 0 && Math.abs(diff) <= TOLERANCE) {
      // Adjust last transaction to compensate
      const last = transactions[transactions.length - 1]!;
      const adjusted = last.amount + diff;
      if (adjusted > 0) {
        last.amount = adjusted;
      }
    }
  }

  return transactions;
}
