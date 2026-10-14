/**
 * Format a number as Vietnamese Dong (VND).
 * Input: integer in đồng (e.g., 150000)
 * Output: "150.000đ"
 */
export function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Lấy dayKey "YYYY-MM-DD" theo giờ VN — stable cho so sánh & group. */
function getVnDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

/** "13/05/2026" — VN date format (timezone-safe). */
export function formatDateVN(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** "13/05/2026 15:30" — VN datetime format cho hiển thị field. */
export function formatDateTimeVN(date: Date): string {
  // Tự assemble parts vì Intl `vi-VN` mặc định đặt time trước date.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  // hour '24' edge case ở Hermes: thay bằng '00'
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('day')}/${get('month')}/${get('year')} ${hour}:${get('minute')}`;
}

/**
 * Section header: "Hôm nay" / "Hôm qua" / "DD/MM/YYYY".
 * `now` injectable cho test deterministic.
 */
export function formatDateSection(date: Date, now: Date = new Date()): string {
  const todayKey = getVnDayKey(now);
  const dateKey = getVnDayKey(date);
  if (dateKey === todayKey) return 'Hôm nay';

  // Tính dayKey của hôm qua: -1 ngày từ now rồi lấy dayKey VN
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = getVnDayKey(yesterday);
  if (dateKey === yesterdayKey) return 'Hôm qua';

  return formatDateVN(date);
}

/** Export internal helper cho expenseGrouping (cùng module để share VN_TIME_ZONE). */
export { getVnDayKey };

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
 * Số tiền dạng gọn cho chỗ chật (danh sách chat, story): KHÔNG kèm dấu — caller tự thêm
 * "+"/"−" theo quy ước số dư. 860000 → "860k", 1250000 → "1,25tr", 12000000 → "12tr",
 * 500 → "500đ". Triệu giữ tối đa 2 chữ số thập phân (cắt số 0 thừa).
 */
export function formatShortVND(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  if (abs < 1_000) return `${abs}đ`;
  if (abs < 1_000_000) return `${Math.round(abs / 1_000)}k`;
  const millions = (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '');
  return `${millions.replace('.', ',')}tr`;
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
export const DEFAULT_MONEY_SUGGESTIONS = [50_000, 100_000, 200_000];

// App chia tiền nhóm, không phải app ngân hàng — gợi ý dưới 10 triệu (loại trừ
// 10tr): mức cao nhất có thể là 9.999.000đ. Cận trên dùng so sánh chặt (`>=`).
const MAX_MONEY_SUGGESTION = 10_000_000; // 10 triệu — KHÔNG bao giờ gợi ý đúng mức này
// Chip nhỏ nhất phải ≥ 10k — các mức 1k–9k quá nhỏ, ít gặp khi chia tiền.
const MIN_MONEY_SUGGESTION = 10_000;
const MONEY_SUGGESTION_COUNT = 3;

/**
 * Generate quick-pick amount suggestions từ "chữ số có nghĩa" user gõ.
 * Mỗi chip = `n × 10^k` — tức số đã gõ thêm các số 0 ở những bậc khác nhau —
 * lọc theo: ≥ 10.000đ (MIN), < 10 triệu (MAX, loại trừ 10tr → tối đa 9.999.000đ),
 * và bội số 1.000đ. Lấy 3 chip nhỏ nhất.
 *
 * KHÔNG gợi ý lại đúng số đang có trong ô (vd ô "450000" thì bỏ chip 450.000 — chạm vào
 * cũng chẳng đổi gì).
 *
 * Hệ quả: các số 0 ở cuối input gần như không ảnh hưởng — "8/80/800/8000" đều ra cùng
 * ladder; riêng "80000" bỏ mức 80.000 vì ô đã là 80.000. Rỗng khi không còn mức nào
 * < 10tr ngoài chính số đang gõ.
 *  - Empty / zero  → fallback to `defaults`.
 *  - "1"           → [10_000, 100_000, 1_000_000]  (10tr bị loại trừ).
 *  - "8"…"8000"    → [80_000, 800_000, 8_000_000].
 *  - "80000"       → [800_000, 8_000_000]  (bỏ 80.000 = số đang gõ).
 *  - "150"         → [15_000, 150_000, 1_500_000].
 *  - "450000"      → [4_500_000].
 *  - "20000000"    → [] (20tr literal đã vượt cap).
 */
export function computeMoneySuggestions(
  rawDigits: string,
  defaults: number[] = DEFAULT_MONEY_SUGGESTIONS,
): number[] {
  if (!rawDigits) return defaults;
  const n = parseInt(rawDigits, 10);
  if (!Number.isFinite(n) || n <= 0) return defaults;

  const out: number[] = [];
  for (let m = 1; ; m *= 10) {
    const v = n * m;
    if (v >= MAX_MONEY_SUGGESTION) break; // v tăng dần → dừng sớm; loại trừ đúng 10tr
    if (v === n) continue; // số đang có trong ô — gợi ý lại là thừa
    if (v >= MIN_MONEY_SUGGESTION && v % 1000 === 0) {
      out.push(v);
      if (out.length === MONEY_SUGGESTION_COUNT) break;
    }
  }
  return out;
}
