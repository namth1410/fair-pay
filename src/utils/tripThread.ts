// Dựng "luồng tin" của 1 chuyến đi (giao diện "Hội thoại" 2026-10): gộp khoản chi + thanh toán
// theo thời gian, chèn vạch ngày, thêm tin hệ thống (đã đóng chuyến) hoặc thẻ gợi ý tất toán.
// Trả về MỚI NHẤT TRƯỚC để render bằng FlatList `inverted` (tin mới nằm sát ô soạn ở đáy).
import { getVnDayKey } from './format';

export interface ThreadEntryBase {
  id: string;
  /** Ngày của khoản chi / thanh toán (ISO date hoặc datetime). */
  date: string;
  created_at: string;
}

export type ThreadItem<E extends ThreadEntryBase, P extends ThreadEntryBase> =
  | { kind: 'day'; key: string; title: string }
  | { kind: 'expense'; key: string; expense: E }
  | { kind: 'payment'; key: string; payment: P }
  | { kind: 'closed'; key: string; closedAt: string }
  | { kind: 'suggest'; key: string };

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function parseTs(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Nhãn vạch ngày kiểu app nhắn tin: "Hôm nay" / "Hôm qua" / "Chủ Nhật, 11/10"
 * (+ "/2025" nếu khác năm hiện tại). Tính theo giờ VN, không phụ thuộc Intl locale của máy.
 */
export function formatThreadDay(date: Date, now: Date = new Date()): string {
  const dayKey = getVnDayKey(date);
  if (dayKey === getVnDayKey(now)) return 'Hôm nay';
  if (dayKey === getVnDayKey(new Date(now.getTime() - 86_400_000))) return 'Hôm qua';

  const [y, m, d] = dayKey.split('-');
  const weekday = WEEKDAYS[new Date(`${dayKey}T00:00:00Z`).getUTCDay()] ?? '';
  const sameYear = y === getVnDayKey(now).slice(0, 4);
  return `${weekday}, ${d}/${m}${sameYear ? '' : `/${y}`}`;
}

export function buildTripThread<E extends ThreadEntryBase, P extends ThreadEntryBase>(input: {
  expenses: readonly E[];
  payments: readonly P[];
  /** Có giá trị khi chuyến đã đóng → tin hệ thống ở cuối luồng. */
  closedAt?: string | null;
  /** Hiện thẻ gợi ý tất toán ở cuối luồng (chỉ khi chuyến còn mở). */
  showSuggest?: boolean;
  now?: Date;
}): ThreadItem<E, P>[] {
  const { expenses, payments, closedAt, showSuggest = false, now = new Date() } = input;

  type Entry =
    | { kind: 'expense'; ts: number; tie: number; item: E }
    | { kind: 'payment'; ts: number; tie: number; item: P };

  const entries: Entry[] = [
    ...expenses.map((e) => ({
      kind: 'expense' as const,
      ts: parseTs(e.date),
      tie: parseTs(e.created_at),
      item: e,
    })),
    ...payments.map((p) => ({
      kind: 'payment' as const,
      ts: parseTs(p.date),
      tie: parseTs(p.created_at),
      item: p,
    })),
  ].sort((a, b) => a.ts - b.ts || a.tie - b.tie);

  const ascending: ThreadItem<E, P>[] = [];
  let lastDayKey = '';
  for (const entry of entries) {
    const d = new Date(entry.ts);
    const dayKey = getVnDayKey(d);
    if (dayKey !== lastDayKey) {
      ascending.push({ kind: 'day', key: `day-${dayKey}`, title: formatThreadDay(d, now) });
      lastDayKey = dayKey;
    }
    ascending.push(
      entry.kind === 'expense'
        ? { kind: 'expense', key: `e-${entry.item.id}`, expense: entry.item }
        : { kind: 'payment', key: `p-${entry.item.id}`, payment: entry.item },
    );
  }

  if (closedAt) {
    ascending.push({ kind: 'closed', key: 'closed', closedAt });
  } else if (showSuggest) {
    ascending.push({ kind: 'suggest', key: 'suggest' });
  }

  // Inverted list: phần tử 0 nằm ở đáy. Đảo mảng → vạch ngày đứng SAU các tin của ngày đó
  // trong mảng, tức hiển thị PHÍA TRÊN chúng.
  return ascending.reverse();
}
