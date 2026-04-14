/**
 * Greedy Simplification Algorithm — BR-07: suggestions only.
 * Calculates optimal settlement transactions to minimize number of transfers.
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
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
    // Round to nearest 1000
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

    debtor.balance += amount;
    creditor.balance -= amount;

    if (Math.abs(debtor.balance) <= TOLERANCE) i++;
    if (creditor.balance <= TOLERANCE) j++;
  }

  return transactions;
}
