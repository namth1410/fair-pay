import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '../../../../../components/expense/ExpenseFormScreen';
import { EXPENSE_CATEGORIES,type ExpenseCategory } from '../../../../../config/constants';

const VALID_CATEGORIES = new Set(EXPENSE_CATEGORIES.map((c) => c.key));

export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{
    id: string;
    expenseId?: string;
    imageUri?: string;
    imageSizeBytes?: string;
    imageWidth?: string;
    imageHeight?: string;
    prefillTitle?: string;
    prefillAmount?: string;
    prefillCategory?: string;
    applyPresetId?: string;
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

  const prefillAmount = params.prefillAmount ? parseInt(params.prefillAmount, 10) : undefined;
  const prefillCategory =
    params.prefillCategory && VALID_CATEGORIES.has(params.prefillCategory as ExpenseCategory)
      ? (params.prefillCategory as ExpenseCategory)
      : undefined;

  return (
    <ExpenseFormScreen
      initialTripId={tripId}
      presetExpenseId={params.expenseId}
      initialImage={initialImage}
      prefillTitle={params.prefillTitle}
      prefillAmount={
        prefillAmount !== undefined && Number.isFinite(prefillAmount) && prefillAmount > 0
          ? prefillAmount
          : undefined
      }
      prefillCategory={prefillCategory}
      applyPresetId={params.applyPresetId}
    />
  );
}
