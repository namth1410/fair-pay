/**
 * Format a number as Vietnamese Dong (VND).
 * Input: integer in đồng (e.g., 150000)
 * Output: "150.000đ"
 */
export function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

/**
 * Format a number with sign for balance display.
 * Positive: "+150.000đ" (green)
 * Negative: "-150.000đ" (red)
 */
export function formatBalance(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return sign + formatVND(amount);
}
