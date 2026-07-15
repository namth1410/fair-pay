import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '../../../../../../components/expense/ExpenseFormScreen';

export default function EditExpenseScreen() {
  const params = useLocalSearchParams<{ id: string; expenseId: string }>();
  const tripId = params.id;
  const expenseId = params.expenseId;
  if (!tripId || !expenseId) return null;

  return <ExpenseFormScreen initialTripId={tripId} editExpenseId={expenseId} />;
}
