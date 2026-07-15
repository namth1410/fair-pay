// Pure: map số dư → nhãn hiển thị trên widget + tone màu. Có unit test.

import { formatVND } from '../utils/format';

export type WidgetTone = 'success' | 'danger' | 'muted';

export interface WidgetBalanceLabel {
  text: string;
  tone: WidgetTone;
}

/**
 * Số dư → nhãn theo góc nhìn user (bài "balance sign convention"):
 *   > 0 → "Được nhận +X" (success)
 *   < 0 → "Bạn nợ X" (danger) — dùng abs vì chữ "nợ" đã mang nghĩa âm
 *   = 0 → "Đã cân bằng" (muted)
 */
export function balanceToWidgetLabel(balance: number): WidgetBalanceLabel {
  if (balance > 0) {
    return { text: `Được nhận +${formatVND(balance)}`, tone: 'success' };
  }
  if (balance < 0) {
    return { text: `Bạn nợ ${formatVND(Math.abs(balance))}`, tone: 'danger' };
  }
  return { text: 'Đã cân bằng', tone: 'muted' };
}
