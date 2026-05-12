import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '../../../components/expense/ExpenseFormScreen';

export default function NewExpenseFromHomeScreen() {
  const params = useLocalSearchParams<{
    expenseId?: string;
    imageUri?: string;
    imageSizeBytes?: string;
    imageWidth?: string;
    imageHeight?: string;
    prefillTitle?: string;
    prefillAmount?: string;
    applyPresetId?: string;
  }>();

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

  return (
    <ExpenseFormScreen
      presetExpenseId={params.expenseId}
      initialImage={initialImage}
      prefillTitle={params.prefillTitle}
      prefillAmount={
        prefillAmount !== undefined && Number.isFinite(prefillAmount) && prefillAmount > 0
          ? prefillAmount
          : undefined
      }
      applyPresetId={params.applyPresetId}
    />
  );
}
