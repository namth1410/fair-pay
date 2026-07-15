// Pure: map số dư → nhãn hiển thị trên widget + tone màu. Có unit test.

import { formatVND } from '../utils/format';

export type WidgetTone = 'success' | 'danger' | 'muted';

export interface WidgetBalanceLabel {
  text: string;
  tone: WidgetTone;
}

/**
 * Số dư → nhãn theo góc nhìn user (bài "balance sign convention"):
 *   > 0 → "+X" (success) — được nhận
 *   < 0 → "-X" (danger) — đang nợ
 *   = 0 → "Đã cân bằng" (muted)
 * Dấu +/- + màu tone đã đủ nghĩa, không cần chữ "Được nhận"/"Bạn nợ".
 */
export function balanceToWidgetLabel(balance: number): WidgetBalanceLabel {
  if (balance > 0) {
    return { text: `+${formatVND(balance)}`, tone: 'success' };
  }
  if (balance < 0) {
    return { text: `-${formatVND(Math.abs(balance))}`, tone: 'danger' };
  }
  return { text: 'Đã cân bằng', tone: 'muted' };
}
