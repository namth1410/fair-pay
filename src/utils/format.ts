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

/**
 * Insert dot separators every 3 digits from the right (1234567 → "1.234.567").
 * JS-thread mirror of the worklet formatter in components/ui/Money.tsx —
 * kept separate because Reanimated UI thread cannot call `Number.toLocaleString`.
 */
export function formatThousands(value: number | string): string {
  const digits =
    typeof value === 'string'
      ? value.replace(/\D/g, '')
      : String(Math.abs(Math.round(value)));
  if (!digits) return '';
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return out;
}

/**
 * Strip non-digits from money input (e.g. user typed/pasted "1.500.000đ" → "1500000").
 * Result is a raw digit string suitable for `parseInt(_, 10)`.
 */
export function parseMoneyInput(text: string): string {
  return text.replace(/\D/g, '');
}

/** Default chip suggestions when the money input is empty. */
export const DEFAULT_MONEY_SUGGESTIONS = [50_000, 100_000, 200_000, 500_000];

const MONEY_MULTIPLIERS_SINGLE = [10_000, 100_000, 1_000_000, 10_000_000];
const MONEY_MULTIPLIERS_MULTI = [1_000, 10_000, 100_000, 1_000_000];
const MAX_MONEY_SUGGESTION = 999_999_999_000; // ~999 tỷ

/**
 * Generate quick-pick amount suggestions based on what the user has typed.
 *  - Empty / zero  → fallback to `defaults`.
 *  - "3"           → [30_000, 300_000, 3_000_000, 30_000_000].
 *  - "35"          → [35_000, 350_000, 3_500_000, 35_000_000].
 *
 * Single-digit input starts at ×10.000 (1k–9k là quá nhỏ, ít gặp);
 * 2+ digit input starts at ×1.000 (cho phép "35" → 35k tự nhiên).
 * Suggestions exceeding the cap are dropped (so list may be < 4 items).
 */
export function computeMoneySuggestions(
  rawDigits: string,
  defaults: number[] = DEFAULT_MONEY_SUGGESTIONS,
): number[] {
  if (!rawDigits) return defaults;
  const n = parseInt(rawDigits, 10);
  if (!Number.isFinite(n) || n <= 0) return defaults;
  const multipliers = n >= 10 ? MONEY_MULTIPLIERS_MULTI : MONEY_MULTIPLIERS_SINGLE;
  const out: number[] = [];
  for (const m of multipliers) {
    const v = n * m;
    if (v > MAX_MONEY_SUGGESTION) break;
    out.push(v);
  }
  return out;
}
