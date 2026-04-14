import { supabase } from '../config/supabase';

export interface Payment {
  id: string;
  trip_id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  note: string | null;
  recorded_by: string;
  date: string;
  created_at: string;
  deleted_at: string | null;
}

export interface Settlement {
  id: string;
  trip_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  generated_at: string;
}

/** Fetch payments for a trip */
export async function fetchPayments(tripId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Record a payment — BR-03: free-form, not bound to algorithm */
export async function createPayment(params: {
  tripId: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  note?: string;
  date?: string;
}): Promise<Payment> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Chưa đăng nhập');

  if (params.fromMemberId === params.toMemberId) {
    throw new Error('Người trả và người nhận không được giống nhau');
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      trip_id: params.tripId,
      group_id: params.groupId,
      from_member_id: params.fromMemberId,
      to_member_id: params.toMemberId,
      amount: params.amount,
      note: params.note || null,
      date: params.date || new Date().toISOString(),
      recorded_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Soft delete payment — admin only */
export async function deletePayment(paymentId: string): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', paymentId);

  if (error) throw error;
}

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

// ── Helper ──────────────────────────────────
async function getAuthUserId(): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single();

  return data?.id ?? null;
}
