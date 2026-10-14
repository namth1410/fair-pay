/**
 * Tests cho formatShortVND (số tiền gọn ở danh sách chat) + pickPastel (màu avatar theo seed).
 */
import { formatShortVND } from '../utils/format';
import { pickPastel } from '../utils/seedGradient';

describe('formatShortVND', () => {
  it('dưới 1.000đ giữ nguyên số + đ', () => {
    expect(formatShortVND(0)).toBe('0đ');
    expect(formatShortVND(500)).toBe('500đ');
  });

  it('nghìn → k', () => {
    expect(formatShortVND(1_000)).toBe('1k');
    expect(formatShortVND(860_000)).toBe('860k');
    expect(formatShortVND(999_000)).toBe('999k');
  });

  it('triệu → tr, tối đa 2 số thập phân, dấu phẩy, bỏ số 0 thừa', () => {
    expect(formatShortVND(1_000_000)).toBe('1tr');
    expect(formatShortVND(1_250_000)).toBe('1,25tr');
    expect(formatShortVND(1_500_000)).toBe('1,5tr');
    expect(formatShortVND(7_420_000)).toBe('7,42tr');
    expect(formatShortVND(12_000_000)).toBe('12tr');
  });

  it('bỏ dấu âm — caller tự thêm dấu theo quy ước số dư', () => {
    expect(formatShortVND(-320_000)).toBe('320k');
    expect(formatShortVND(-1_250_000)).toBe('1,25tr');
  });
});

describe('pickPastel', () => {
  it('deterministic theo seed', () => {
    expect(pickPastel('group-1', false)).toEqual(pickPastel('group-1', false));
  });

  it('cùng seed giữ cùng vị trí màu ở 2 theme (bảng light/dark song song)', () => {
    const seeds = ['a', 'b', 'c', 'group-xyz', 'trip-123'];
    const lightBgs = ['#CDEFD8', '#FFE9A8', '#DCE9FF', '#FFDCD2', '#EFE6FF', '#D7F2F0'];
    const darkBgs = ['#1E3B2A', '#3A3216', '#1C2B44', '#3D211C', '#2C2342', '#163533'];
    for (const s of seeds) {
      expect(lightBgs.indexOf(pickPastel(s, false).bg)).toBe(
        darkBgs.indexOf(pickPastel(s, true).bg),
      );
    }
  });
});
