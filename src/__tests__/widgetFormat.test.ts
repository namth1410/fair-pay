import { formatVND } from '../utils/format';
import { balanceToWidgetLabel } from '../widgets/widgetFormat';

describe('balanceToWidgetLabel', () => {
  it('số dương → "Được nhận +X" + tone success', () => {
    const r = balanceToWidgetLabel(250000);
    expect(r.tone).toBe('success');
    expect(r.text).toBe(`Được nhận +${formatVND(250000)}`);
  });

  it('số âm → "Bạn nợ X" (abs, không có dấu -) + tone danger', () => {
    const r = balanceToWidgetLabel(-80000);
    expect(r.tone).toBe('danger');
    expect(r.text).toBe(`Bạn nợ ${formatVND(80000)}`);
    expect(r.text).not.toContain('-');
  });

  it('bằng 0 → "Đã cân bằng" + tone muted', () => {
    const r = balanceToWidgetLabel(0);
    expect(r.tone).toBe('muted');
    expect(r.text).toBe('Đã cân bằng');
  });
});
