import { splitEqual, validateSplits, type SplitResult } from '../utils/split';

describe('splitEqual', () => {
  // ── Basic cases ──

  it('chia đều 300.000đ cho 3 người → mỗi người 100.000đ', () => {
    const result = splitEqual(300000, ['A', 'B', 'C']);
    expect(result).toEqual([
      { memberId: 'A', amount: 100000 },
      { memberId: 'B', amount: 100000 },
      { memberId: 'C', amount: 100000 },
    ]);
  });

  it('chia đều 100.000đ cho 2 người → mỗi người 50.000đ', () => {
    const result = splitEqual(100000, ['A', 'B']);
    expect(result).toEqual([
      { memberId: 'A', amount: 50000 },
      { memberId: 'B', amount: 50000 },
    ]);
  });

  it('1 người → nhận toàn bộ', () => {
    const result = splitEqual(500000, ['A']);
    expect(result).toEqual([{ memberId: 'A', amount: 500000 }]);
  });

  it('0 người → mảng rỗng', () => {
    const result = splitEqual(100000, []);
    expect(result).toEqual([]);
  });

  // ── TC-01: Chia không đều, remainder về người đầu ──

  it('TC-01: 500.000đ / 3 người → 167.000 + 167.000 + 166.000', () => {
    const result = splitEqual(500000, ['A', 'B', 'C']);
    // base = floor(500000/3/1000)*1000 = floor(166.666)*1000 = 166000
    // remainder = 500000 - 166000*3 = 500000 - 498000 = 2000
    // A gets 166000+2000 = 168000, B=166000, C=166000
    expect(result[0].amount).toBe(168000);
    expect(result[1].amount).toBe(166000);
    expect(result[2].amount).toBe(166000);
  });

  it('100.000đ / 3 người → remainder cộng người đầu', () => {
    const result = splitEqual(100000, ['A', 'B', 'C']);
    // base = floor(100000/3/1000)*1000 = floor(33.333)*1000 = 33000
    // remainder = 100000 - 33000*3 = 100000 - 99000 = 1000
    expect(result[0].amount).toBe(34000);
    expect(result[1].amount).toBe(33000);
    expect(result[2].amount).toBe(33000);
  });

  it('10.000đ / 3 người → base 3000, remainder 1000', () => {
    const result = splitEqual(10000, ['A', 'B', 'C']);
    // base = floor(10000/3/1000)*1000 = floor(3.333)*1000 = 3000
    // remainder = 10000 - 9000 = 1000
    expect(result[0].amount).toBe(4000);
    expect(result[1].amount).toBe(3000);
    expect(result[2].amount).toBe(3000);
  });

  it('7.000đ / 3 người → base 2000, remainder 1000', () => {
    const result = splitEqual(7000, ['A', 'B', 'C']);
    expect(result[0].amount).toBe(3000);
    expect(result[1].amount).toBe(2000);
    expect(result[2].amount).toBe(2000);
  });

  it('1.000.000đ / 7 người', () => {
    const result = splitEqual(1000000, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    // base = floor(1000000/7/1000)*1000 = floor(142.857)*1000 = 142000
    // remainder = 1000000 - 142000*7 = 1000000 - 994000 = 6000
    expect(result[0].amount).toBe(148000); // 142000 + 6000
    for (let i = 1; i < 7; i++) {
      expect(result[i].amount).toBe(142000);
    }
  });

  // ── BR-02: Tổng splits luôn bằng total ──

  it('BR-02: tổng splits = total cho mọi case chia đều', () => {
    const testCases = [
      { total: 500000, n: 3 },
      { total: 100000, n: 3 },
      { total: 1000000, n: 7 },
      { total: 333000, n: 4 },
      { total: 50000, n: 6 },
      { total: 1000, n: 3 },
      { total: 999000, n: 11 },
      { total: 10000000, n: 13 },
      { total: 1, n: 1 },      // edge: 1 đồng 1 người
      { total: 5000, n: 2 },
    ];

    for (const { total, n } of testCases) {
      const ids = Array.from({ length: n }, (_, i) => `M${i}`);
      const result = splitEqual(total, ids);
      const sum = result.reduce((acc, s) => acc + s.amount, 0);
      expect(sum).toBe(total);
    }
  });

  it('BR-02: tổng splits = total cho số lẻ nhỏ', () => {
    // 5000đ / 3 → base = floor(5000/3/1000)*1000 = 1000
    // remainder = 5000 - 3000 = 2000 → A=3000, B=1000, C=1000
    const result = splitEqual(5000, ['A', 'B', 'C']);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(5000);
  });

  // ── Edge cases ──

  it('số tiền rất lớn: 100 triệu / 5 người', () => {
    const result = splitEqual(100000000, ['A', 'B', 'C', 'D', 'E']);
    expect(result[0].amount).toBe(20000000);
    expect(result[4].amount).toBe(20000000);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(100000000);
  });

  it('nhiều người: 20 người chia 1 triệu', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `M${i}`);
    const result = splitEqual(1000000, ids);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(1000000);
    expect(result.every((s) => s.amount >= 0)).toBe(true);
  });

  it('mỗi split phải là bội số của 1000', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `M${i}`);
    const result = splitEqual(1000000, ids);
    for (const s of result) {
      expect(s.amount % 1000).toBe(0);
    }
  });
});

describe('validateSplits', () => {
  it('hợp lệ khi tổng khớp', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 100000 },
      { memberId: 'B', amount: 100000 },
      { memberId: 'C', amount: 100000 },
    ];
    expect(validateSplits(300000, splits)).toBeNull();
  });

  it('lỗi khi tổng không khớp', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 100000 },
      { memberId: 'B', amount: 100000 },
    ];
    const err = validateSplits(300000, splits);
    expect(err).not.toBeNull();
    expect(err).toContain('khác');
  });

  it('lỗi khi có số tiền âm', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 400000 },
      { memberId: 'B', amount: -100000 },
    ];
    const err = validateSplits(300000, splits);
    expect(err).toBe('Số tiền không được âm');
  });

  it('hợp lệ khi amount = 0 cho một người', () => {
    const splits: SplitResult[] = [
      { memberId: 'A', amount: 300000 },
      { memberId: 'B', amount: 0 },
    ];
    expect(validateSplits(300000, splits)).toBeNull();
  });

  it('hợp lệ với mảng rỗng và total = 0', () => {
    expect(validateSplits(0, [])).toBeNull();
  });

  it('lỗi với mảng rỗng nhưng total > 0', () => {
    const err = validateSplits(100000, []);
    expect(err).not.toBeNull();
  });

  // Stress: output của splitEqual luôn pass validateSplits
  it('splitEqual output luôn pass validateSplits', () => {
    const cases = [
      { total: 500000, n: 3 },
      { total: 1000000, n: 7 },
      { total: 333000, n: 4 },
      { total: 10000, n: 3 },
      { total: 99000, n: 11 },
    ];
    for (const { total, n } of cases) {
      const ids = Array.from({ length: n }, (_, i) => `M${i}`);
      const splits = splitEqual(total, ids);
      expect(validateSplits(total, splits)).toBeNull();
    }
  });
});
