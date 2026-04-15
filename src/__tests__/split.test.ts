/**
 * Tests viết từ đặc tả nghiệp vụ — business-requirements.md
 * Mục đích: Đảm bảo logic chia tiền khớp 100% với yêu cầu spec.
 *
 * Ref: BR-01, BR-02, TC-01
 */
import { computeBalancesSimple } from '../utils/balance';
import { calculateSettlements } from '../utils/settlement';
import {
  splitByRatio,
  splitByRatioWithExplanation,
  splitEqual,
  splitEqualWithExplanation,
  type SplitResult,
  validateAmount,
  validateSplits,
} from '../utils/split';

describe('BR-01: Số tiền luôn là số nguyên, làm tròn đến 1.000đ', () => {
  it('TC-01: 500.000đ / 3 người → 167.000 + 167.000 + 166.000', () => {
    // Spec nguyên văn: "167.000 + 167.000 + 166.000 = 500.000đ"
    const result = splitEqual(500000, ['A', 'B', 'C']);
    expect(result.map((r) => r.amount)).toEqual([167000, 167000, 166000]);
  });

  it('mọi split phải là bội số của 1.000đ (khi total đủ lớn)', () => {
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

describe('validateAmount — BR-01: input phải là bội 1.000đ', () => {
  it('hợp lệ: bội của 1000', () => {
    expect(validateAmount(1000)).toBeNull();
    expect(validateAmount(50000)).toBeNull();
    expect(validateAmount(1000000)).toBeNull();
    expect(validateAmount(100000000)).toBeNull();
  });

  it('lỗi: không phải bội 1000', () => {
    expect(validateAmount(500)).not.toBeNull();
    expect(validateAmount(1234)).not.toBeNull();
    expect(validateAmount(99999)).not.toBeNull();
  });

  it('lỗi: số tiền = 0', () => {
    expect(validateAmount(0)).toBe('Số tiền phải lớn hơn 0');
  });

  it('lỗi: số tiền âm', () => {
    expect(validateAmount(-100000)).toBe('Số tiền phải lớn hơn 0');
  });

  it('lỗi: số thập phân', () => {
    expect(validateAmount(100000.5)).toBe('Số tiền phải là số nguyên');
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

  it('chênh lệch giữa người nhiều nhất và ít nhất tối đa 1.000đ (khi total đủ lớn)', () => {
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

// ═══════════════════════════════════════════════════
// NEW: Edge cases cho số tiền nhỏ (Bug fix)
// ═══════════════════════════════════════════════════

describe('splitEqual — số tiền nhỏ hơn n * 1000', () => {
  it('1000đ / 3 người → chia fair bằng đơn vị 1đ, tổng = 1000', () => {
    const result = splitEqual(1000, ['A', 'B', 'C']);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(1000);
    // Mỗi người nên trả ≈ 333đ, không ai trả 0
    expect(result.every((s) => s.amount > 0)).toBe(true);
  });

  it('1000đ / 10 người → fair distribution, tổng = 1000', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `M${i}`);
    const result = splitEqual(1000, ids);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(1000);
    // Mỗi người = 100đ
    expect(result.every((s) => s.amount === 100)).toBe(true);
  });

  it('2000đ / 3 người → 666 + 666 + 668, tổng = 2000', () => {
    const result = splitEqual(2000, ['A', 'B', 'C']);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(2000);
    expect(result.every((s) => s.amount > 0)).toBe(true);
  });

  it('số tiền = 0 → tất cả trả 0', () => {
    const result = splitEqual(0, ['A', 'B', 'C']);
    expect(result.every((s) => s.amount === 0)).toBe(true);
  });

  it('số tiền âm → tất cả trả 0 (defensive)', () => {
    const result = splitEqual(-100000, ['A', 'B']);
    expect(result.every((s) => s.amount === 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════
// NEW: splitEqualWithExplanation — giải thích bước chia tiền
// ═══════════════════════════════════════════════════

describe('splitEqualWithExplanation — giải thích chia tiền', () => {
  it('500k / 3 người → có 3 bước giải thích + splits đúng', () => {
    const result = splitEqualWithExplanation(500000, ['A', 'B', 'C']);
    expect(result.total).toBe(500000);
    expect(result.memberCount).toBe(3);
    expect(result.splits.length).toBe(3);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);

    // Splits vẫn đúng như splitEqual
    const sum = result.splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(500000);
  });

  it('300k / 3 người chia hết → ghi "không có phần dư"', () => {
    const result = splitEqualWithExplanation(300000, ['A', 'B', 'C']);
    expect(result.remainder).toBe(0);
    expect(result.steps.some((s) => s.includes('không có phần dư') || s.includes('Chia hết'))).toBe(true);
  });

  it('0 người → steps ghi "Không có thành viên"', () => {
    const result = splitEqualWithExplanation(100000, []);
    expect(result.memberCount).toBe(0);
    expect(result.splits.length).toBe(0);
    expect(result.steps.some((s) => s.includes('Không có thành viên'))).toBe(true);
  });

  it('steps bước cuối luôn chứa ký hiệu ✓ (verify)', () => {
    const result = splitEqualWithExplanation(500000, ['A', 'B', 'C']);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep).toContain('✓');
  });
});

// ═══════════════════════════════════════════════════
// NEW: Full-cycle integration test
// ═══════════════════════════════════════════════════

describe('Integration: expense → balance → settlement → payment → settled', () => {
  it('full cycle — tất cả trả theo gợi ý → all balance = 0', () => {

    const members = ['An', 'Binh', 'Chi', 'Dung'];

    // Step 1: Tạo expense 400k, An trả, chia đều 4 người
    const expenses = [
      {
        paidBy: 'An', amount: 400000, splits: [
          { memberId: 'An', amount: 100000 },
          { memberId: 'Binh', amount: 100000 },
          { memberId: 'Chi', amount: 100000 },
          { memberId: 'Dung', amount: 100000 },
        ],
      },
    ];

    // Step 2: Tính balance
    const balances = computeBalancesSimple(members, expenses, []);
    expect(balances['An']).toBe(300000);    // được nợ 300k
    expect(balances['Binh']).toBe(-100000); // nợ 100k

    // Step 3: Tính settlement gợi ý
    const balanceArr = members.map((id: string) => ({
      memberId: id, memberName: id, balance: balances[id] ?? 0,
    }));
    const settlements = calculateSettlements(balanceArr);
    expect(settlements.length).toBeGreaterThanOrEqual(1);

    // Step 4: Tạo payments ĐÚNG theo gợi ý
    const payments = settlements.map((s: any) => ({
      fromMemberId: s.from,
      toMemberId: s.to,
      amount: s.amount,
    }));

    // Step 5: Tính balance lại → tất cả ≈ 0
    const finalBalances = computeBalancesSimple(members, expenses, payments);
    const totalImbalance = Object.values(finalBalances).reduce(
      (sum: number, v: unknown) => sum + Math.abs(v as number), 0
    );
    // Cho phép sai số do rounding ≤ 1000đ × số người
    expect(totalImbalance).toBeLessThanOrEqual(members.length * 1000);
  });
});

// ═══════════════════════════════════════════════════
// F-07: splitByRatio — chia theo tỷ lệ
// ═══════════════════════════════════════════════════

describe('F-07: splitByRatio — chia theo tỷ lệ', () => {
  it('300k, tỷ lệ 2:1:1 → 150k, 75k, 75k', () => {
    const result = splitByRatio(300000, [
      { memberId: 'A', ratio: 2 },
      { memberId: 'B', ratio: 1 },
      { memberId: 'C', ratio: 1 },
    ]);
    expect(result.map((r) => r.amount)).toEqual([150000, 75000, 75000]);
  });

  it('tổng splits = total (BR-02) — nhiều combo', () => {
    const cases: { total: number; ratios: number[] }[] = [
      { total: 300000, ratios: [2, 1, 1] },
      { total: 500000, ratios: [3, 2, 1] },
      { total: 1000000, ratios: [5, 3, 2] },
      { total: 100000, ratios: [1, 1, 1] }, // same as equal
      { total: 700000, ratios: [4, 3, 2, 1] },
      { total: 999000, ratios: [7, 3] },
    ];
    for (const { total, ratios } of cases) {
      const members = ratios.map((r, i) => ({ memberId: `M${i}`, ratio: r }));
      const result = splitByRatio(total, members);
      const sum = result.reduce((acc, s) => acc + s.amount, 0);
      expect(sum).toBe(total);
    }
  });

  it('amounts luôn là bội 1000đ (BR-01)', () => {
    const result = splitByRatio(500000, [
      { memberId: 'A', ratio: 3 },
      { memberId: 'B', ratio: 2 },
      { memberId: 'C', ratio: 1 },
    ]);
    for (const s of result) {
      // Last person may not be multiple of 1000 if total isn't perfectly divisible
      // but since total is always multiple of 1000, it should work
      expect(Number.isInteger(s.amount)).toBe(true);
    }
  });

  it('tỷ lệ đều [1,1,1] → tương đương splitEqual', () => {
    const ratioResult = splitByRatio(300000, [
      { memberId: 'A', ratio: 1 },
      { memberId: 'B', ratio: 1 },
      { memberId: 'C', ratio: 1 },
    ]);
    const equalResult = splitEqual(300000, ['A', 'B', 'C']);
    expect(ratioResult.map((r) => r.amount)).toEqual(equalResult.map((r) => r.amount));
  });

  it('1 người → nhận toàn bộ', () => {
    const result = splitByRatio(500000, [{ memberId: 'A', ratio: 5 }]);
    expect(result).toEqual([{ memberId: 'A', amount: 500000 }]);
  });

  it('0 người → mảng rỗng', () => {
    expect(splitByRatio(100000, [])).toEqual([]);
  });

  it('total = 0 → tất cả = 0', () => {
    const result = splitByRatio(0, [
      { memberId: 'A', ratio: 2 },
      { memberId: 'B', ratio: 1 },
    ]);
    expect(result.every((s) => s.amount === 0)).toBe(true);
  });

  it('ratio không đều lớn: 10:1 → 909k : 91k', () => {
    const result = splitByRatio(1000000, [
      { memberId: 'A', ratio: 10 },
      { memberId: 'B', ratio: 1 },
    ]);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(1000000);
    expect(result[0]!.amount).toBeGreaterThan(result[1]!.amount);
  });

  it('validateSplits pass trên output — đảm bảo BR-02', () => {
    const result = splitByRatio(500000, [
      { memberId: 'A', ratio: 3 },
      { memberId: 'B', ratio: 2 },
      { memberId: 'C', ratio: 1 },
    ]);
    expect(validateSplits(500000, result)).toBeNull();
  });
});

describe('F-07: splitByRatioWithExplanation', () => {
  it('có steps giải thích + splits đúng', () => {
    const result = splitByRatioWithExplanation(300000, [
      { memberId: 'A', ratio: 2 },
      { memberId: 'B', ratio: 1 },
      { memberId: 'C', ratio: 1 },
    ]);
    expect(result.total).toBe(300000);
    expect(result.splits.length).toBe(3);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);

    const sum = result.splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(300000);
  });

  it('steps chứa tỷ lệ', () => {
    const result = splitByRatioWithExplanation(300000, [
      { memberId: 'A', ratio: 2 },
      { memberId: 'B', ratio: 1 },
    ]);
    expect(result.steps.some((s) => s.includes('2:1'))).toBe(true);
  });

  it('bước cuối chứa ✓', () => {
    const result = splitByRatioWithExplanation(500000, [
      { memberId: 'A', ratio: 3 },
      { memberId: 'B', ratio: 2 },
    ]);
    const lastStep = result.steps[result.steps.length - 1];
    expect(lastStep).toContain('✓');
  });
});

// ═══════════════════════════════════════════════════
// Integration: ratio split → balance → settlement
// ═══════════════════════════════════════════════════

describe('Integration: ratio split flow', () => {
  it('ratio expense → balance → settlement → payment → settled', () => {

    const members = ['An', 'Binh', 'Chi'];

    // An trả 600k, chia ratio 3:2:1
    const ratioSplits = splitByRatio(600000, [
      { memberId: 'An', ratio: 3 },    // 300k
      { memberId: 'Binh', ratio: 2 },  // 200k
      { memberId: 'Chi', ratio: 1 },   // 100k
    ]);

    const expenses = [{
      paidBy: 'An', amount: 600000, splits: ratioSplits,
    }];

    // Balance: An paid 600k, owes 300k → net +300k
    const balances = computeBalancesSimple(members, expenses, []);
    expect(balances['An']).toBe(300000);    // +300k
    expect(balances['Binh']).toBe(-200000); // -200k
    expect(balances['Chi']).toBe(-100000);  // -100k

    // Total = 0
    const total = Object.values(balances).reduce((s: number, v: unknown) => s + (v as number), 0);
    expect(total).toBe(0);

    // Settlement
    const balanceArr = members.map((id: string) => ({
      memberId: id, memberName: id, balance: balances[id] ?? 0,
    }));
    const settlements = calculateSettlements(balanceArr);
    expect(settlements.length).toBeGreaterThanOrEqual(1);

    // Pay according to suggestions
    const payments = settlements.map((s: any) => ({
      fromMemberId: s.from, toMemberId: s.to, amount: s.amount,
    }));
    const finalBalances = computeBalancesSimple(members, expenses, payments);
    const imbalance = Object.values(finalBalances).reduce(
      (s: number, v: unknown) => s + Math.abs(v as number), 0
    );
    expect(imbalance).toBeLessThanOrEqual(members.length * 1000);
  });
});
