import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '../../../../../components/expense/ExpenseFormScreen';

export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{
    id: string;
    expenseId?: string;
    imageUri?: string;
    imageSizeBytes?: string;
    imageWidth?: string;
    imageHeight?: string;
  }>();
  const tripId = params.id;
  if (!tripId) return null;

  const sizeBytes = params.imageSizeBytes ? parseInt(params.imageSizeBytes, 10) : NaN;
  const width = params.imageWidth ? parseInt(params.imageWidth, 10) : NaN;
  const height = params.imageHeight ? parseInt(params.imageHeight, 10) : NaN;
  const initialImage =
    params.imageUri &&
    Number.isFinite(sizeBytes) && sizeBytes > 0 &&
    Number.isFinite(width) && width > 0 &&
    Number.isFinite(height) && height > 0
      ? { uri: params.imageUri, sizeBytes, width, height }
      : null;

  return (
    <ExpenseFormScreen
      initialTripId={tripId}
      presetExpenseId={params.expenseId}
      initialImage={initialImage}
    />
  );
}
