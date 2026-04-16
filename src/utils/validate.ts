/**
 * Shared input validation — used by service layer before DB writes.
 * Returns error message string or null if valid.
 */

export function validateName(name: string, label: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return `${label} không được để trống`;
  if (trimmed.length > 100) return `${label} không được quá 100 ký tự`;
  return null;
}

export function validatePositiveAmount(amount: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) {
    return 'Số tiền phải là số nguyên dương';
  }
  return null;
}
