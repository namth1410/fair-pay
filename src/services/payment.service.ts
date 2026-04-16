import { supabase } from '../config/supabase';
import { validatePositiveAmount } from '../utils/validate';

import { getAuthUserId } from './auth.helper';

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
  const amountErr = validatePositiveAmount(params.amount);
  if (amountErr) throw new Error(amountErr);

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

// Re-export from utils for backward compatibility
export { calculateSettlements } from '../utils/settlement';
