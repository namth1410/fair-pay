/**
 * Tests viết từ đặc tả nghiệp vụ — business-requirements.md
 * Mục đích: Đảm bảo logic chia tiền khớp 100% với yêu cầu spec.
 *
 * Ref: BR-01, BR-02, TC-01
 */
import { splitEqual, validateSplits, type SplitResult } from '../utils/split';

describe('BR-01: Số tiền luôn là số nguyên, làm tròn đến 1.000đ', () => {
  it('TC-01: 500.000đ / 3 người → 167.000 + 167.000 + 166.000', () => {
    // Spec nguyên văn: "167.000 + 167.000 + 166.000 = 500.000đ"
    const result = splitEqual(500000, ['A', 'B', 'C']);
    expect(result.map((r) => r.amount)).toEqual([167000, 167000, 166000]);
  });

  it('mọi split phải là bội số của 1.000đ', () => {
    const testCases = [
      { total: 500000, n: 3 },
      { total: 100000, n: 3 },
      { total: 1000000, n: 7 },
      { total: 333000, n: 4 },
      { total: 10000, n: 3 },
      { total: 250000, n: 6 },
      { total: 999000, n: 11 },
    ];
    for (const { total, n } of testCases) {
      const ids = Array.from({ length: n }, (_, i) => `M${i}`);
      const result = splitEqual(total, ids);
      for (const s of result) {
        expect(s.amount % 1000).toBe(0);
      }
    }
  });

  it('không bao giờ dùng float — mọi amount phải là integer', () => {
    const result = splitEqual(999000, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    for (const s of result) {
      expect(Number.isInteger(s.amount)).toBe(true);
    }
  });
});

describe('BR-02: Tổng split = tổng khoản chi', () => {
  it('tổng splits luôn bằng total — nhiều combo khác nhau', () => {
    const testCases = [
      { total: 500000, n: 3 },   // TC-01 case
      { total: 300000, n: 3 },   // TC-02 case
      { total: 100000, n: 3 },
      { total: 1000000, n: 7 },
      { total: 50000, n: 6 },
      { total: 1000, n: 3 },
      { total: 10000000, n: 13 },
      { total: 7000, n: 3 },
      { total: 250000, n: 4 },
      { total: 2000000, n: 5 },  // Kịch bản Đà Lạt
    ];

    for (const { total, n } of testCases) {
      const ids = Array.from({ length: n }, (_, i) => `M${i}`);
      const result = splitEqual(total, ids);
      const sum = result.reduce((acc, s) => acc + s.amount, 0);
      expect(sum).toBe(total);
    }
  });

  it('splitEqual output luôn pass validateSplits', () => {
    const cases = [
      { total: 500000, n: 3 },
      { total: 300000, n: 3 },
      { total: 1000000, n: 7 },
      { total: 10000, n: 3 },
    ];
    for (const { total, n } of cases) {
      const ids = Array.from({ length: n }, (_, i) => `M${i}`);
      const splits = splitEqual(total, ids);
      expect(validateSplits(total, splits)).toBeNull();
    }
  });
});

describe('validateSplits — kiểm tra trước khi lưu', () => {
  it('hợp lệ khi tổng khớp', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 100000 },
      { memberId: 'B', amount: 100000 },
      { memberId: 'C', amount: 100000 },
    ];
    expect(validateSplits(300000, splits)).toBeNull();
  });

  it('lỗi khi tổng không khớp — phải reject trước khi lưu', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 100000 },
      { memberId: 'B', amount: 100000 },
    ];
    expect(validateSplits(300000, splits)).not.toBeNull();
  });

  it('lỗi khi có số tiền âm', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 400000 },
      { memberId: 'B', amount: -100000 },
    ];
    expect(validateSplits(300000, splits)).toBe('Số tiền không được âm');
  });
});

describe('splitEqual — edge cases thực tế', () => {
  it('chia đều cho 1 người → nhận toàn bộ', () => {
    const result = splitEqual(500000, ['A']);
    expect(result).toEqual([{ memberId: 'A', amount: 500000 }]);
  });

  it('0 người → mảng rỗng (không crash)', () => {
    expect(splitEqual(100000, [])).toEqual([]);
  });

  it('2 người chia đều 100.000đ → mỗi người 50.000đ', () => {
    const result = splitEqual(100000, ['A', 'B']);
    expect(result.map((r) => r.amount)).toEqual([50000, 50000]);
  });

  it('chênh lệch giữa người nhiều nhất và ít nhất tối đa 1.000đ', () => {
    const cases = [
      { total: 500000, n: 3 },
      { total: 1000000, n: 7 },
      { total: 333000, n: 4 },
    ];
    for (const { total, n } of cases) {
      const ids = Array.from({ length: n }, (_, i) => `M${i}`);
      const amounts = splitEqual(total, ids).map((s) => s.amount);
      const max = Math.max(...amounts);
      const min = Math.min(...amounts);
      expect(max - min).toBeLessThanOrEqual(1000);
    }
  });

  it('nhiều người: 20 người chia 1 triệu', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `M${i}`);
    const result = splitEqual(1000000, ids);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(1000000);
    expect(result.every((s) => s.amount >= 0)).toBe(true);
  });

  it('số tiền lớn: 100 triệu / 5 người', () => {
    const result = splitEqual(100000000, ['A', 'B', 'C', 'D', 'E']);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(100000000);
    expect(result.every((s) => s.amount === 20000000)).toBe(true);
  });
});
