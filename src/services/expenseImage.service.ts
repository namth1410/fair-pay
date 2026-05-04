import { supabase } from '../config/supabase';

// Mirror invokeAvatarFunction từ group.service.ts — Edge Function lỗi trả về
// `{ error: string, retryAfter?: number }` qua context body. Mỗi service file
// có copy riêng để tránh circular import giữa group.service và file này.
interface ExpenseImageFunctionError {
  error?: string;
  retryAfter?: number;
}

async function invokeExpenseImageFunction<T>(
  name:
    | 'expense-image-presign'
    | 'expense-image-commit'
    | 'expense-image-remove',
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    let parsed: ExpenseImageFunctionError | null = null;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        parsed = (await ctx.json()) as ExpenseImageFunctionError;
      } catch {
        parsed = null;
      }
    }
    if (__DEV__) {
      console.error(`[expense-image] ${name} failed:`, {
        rawMessage: error.message,
        status: (error as unknown as { context?: { status?: number } }).context
          ?.status,
        parsedBody: parsed,
      });
    }
    const message = parsed?.error || error.message || 'Lỗi mạng, thử lại sau';
    const wrapped = new Error(message) as Error & { retryAfter?: number };
    if (parsed?.retryAfter) wrapped.retryAfter = parsed.retryAfter;
    throw wrapped;
  }
  return data as T;
}

export async function requestExpenseImageUploadUrl(
  expenseId: string,
  tripId: string,
  sizeBytes: number,
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }> {
  return invokeExpenseImageFunction('expense-image-presign', {
    expenseId,
    tripId,
    sizeBytes,
  });
}

export async function commitExpenseImage(
  expenseId: string,
  fileKey: string,
): Promise<{ image_url: string }> {
  return invokeExpenseImageFunction('expense-image-commit', {
    expenseId,
    fileKey,
  });
}

export async function removeExpenseImage(expenseId: string): Promise<void> {
  await invokeExpenseImageFunction('expense-image-remove', { expenseId });
}
