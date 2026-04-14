/**
 * Tests viết từ đặc tả nghiệp vụ — business-requirements.md
 * Ref: BR-07, TC-03, TC-05, thuật toán Greedy Simplification
 *
 * BR-07: Đề xuất quyết toán chỉ là gợi ý.
 * Thuật toán tối giản số giao dịch, sai số ±1000đ.
 */
import { calculateSettlements } from '../utils/settlement';

function bal(id: string, name: string, balance: number) {
  return { memberId: id, memberName: name, balance };
}

// ═══════════════════════════════════════════════════
// BR-07: Đề xuất quyết toán chỉ là gợi ý
// ═══════════════════════════════════════════════════

describe('BR-07: Thuật toán quyết toán — Greedy Simplification', () => {

  // ── Từ TC-02: 3 người cơ bản ──

  it('TC-02 balance → 2 giao dịch: Bình→An 100k, Chi→An 100k', () => {
    const result = calculateSettlements([
      bal('an', 'An', 200000),
      bal('binh', 'Bình', -100000),
      bal('chi', 'Chi', -100000),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((t) => t.to === 'an')).toBe(true);
    const total = result.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(200000);
  });

  // ── Từ TC-03: Sau payment dư, balance đảo chiều ──

  it('TC-03 balance sau payment dư → Chi trả An 80k, Chi trả Bình 20k', () => {
    // Sau expense + Bình trả An 120k: An +80k, Bình +20k, Chi -100k
    const result = calculateSettlements([
      bal('an', 'An', 80000),
      bal('binh', 'Bình', 20000),
      bal('chi', 'Chi', -100000),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((t) => t.from === 'chi')).toBe(true);

    const toAn = result.find((t) => t.to === 'an');
    const toBinh = result.find((t) => t.to === 'binh');
    expect(toAn?.amount).toBe(80000);
    expect(toBinh?.amount).toBe(20000);
  });

  // ── Tối giản số giao dịch ──

  it('5 người: tối đa N-1 = 4 giao dịch', () => {
    const result = calculateSettlements([
      bal('A', 'A', 400000),
      bal('B', 'B', 100000),
      bal('C', 'C', -200000),
      bal('D', 'D', -150000),
      bal('E', 'E', -150000),
    ]);
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result.every((t) => t.amount > 0)).toBe(true);
  });

  it('10 người: tối đa N-1 = 9 giao dịch', () => {
    const result = calculateSettlements([
      bal('M1', 'M1', 500000),
      bal('M2', 'M2', 300000),
      bal('M3', 'M3', 200000),
      bal('M4', 'M4', -100000),
      bal('M5', 'M5', -150000),
      bal('M6', 'M6', -200000),
      bal('M7', 'M7', -150000),
      bal('M8', 'M8', -100000),
      bal('M9', 'M9', -200000),
      bal('M10', 'M10', -100000),
    ]);
    expect(result.length).toBeLessThanOrEqual(9);
  });

  // ── 1 creditor, nhiều debtor ──

  it('1 creditor, 4 debtors → mỗi debtor trả 1 lần', () => {
    const result = calculateSettlements([
      bal('A', 'A', 400000),
      bal('B', 'B', -100000),
      bal('C', 'C', -100000),
      bal('D', 'D', -100000),
      bal('E', 'E', -100000),
    ]);
    expect(result.length).toBe(4);
    expect(result.every((t) => t.to === 'A')).toBe(true);
    expect(result.every((t) => t.amount === 100000)).toBe(true);
  });

  // ── Nhiều creditor, 1 debtor ──

  it('4 creditors, 1 debtor → debtor trả mỗi người 1 lần', () => {
    const result = calculateSettlements([
      bal('A', 'A', 100000),
      bal('B', 'B', 100000),
      bal('C', 'C', 100000),
      bal('D', 'D', 100000),
      bal('E', 'E', -400000),
    ]);
    expect(result.length).toBe(4);
    expect(result.every((t) => t.from === 'E')).toBe(true);
  });

  // ── Sai số ±1.000đ — balance nhỏ được bỏ qua ──

  it('balance ≤ 1.000đ → bỏ qua (sai số làm tròn)', () => {
    expect(calculateSettlements([
      bal('A', 'A', 500),
      bal('B', 'B', -500),
    ])).toEqual([]);

    expect(calculateSettlements([
      bal('A', 'A', 1000),
      bal('B', 'B', -1000),
    ])).toEqual([]);
  });

  it('balance > 1.000đ → tạo giao dịch', () => {
    const result = calculateSettlements([
      bal('A', 'A', 2000),
      bal('B', 'B', -2000),
    ]);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ from: 'B', to: 'A', amount: 2000 });
  });

  // ── Amounts luôn round đến 1.000đ ──

  it('amounts luôn là bội số của 1.000đ', () => {
    const result = calculateSettlements([
      bal('A', 'A', 333333),
      bal('B', 'B', -166666),
      bal('C', 'C', -166667),
    ]);
    for (const t of result) {
      expect(t.amount % 1000).toBe(0);
    }
  });

  // ── Edge cases ──

  it('tất cả balance = 0 → không có giao dịch', () => {
    expect(calculateSettlements([
      bal('A', 'A', 0), bal('B', 'B', 0), bal('C', 'C', 0),
    ])).toEqual([]);
  });

  it('chỉ có creditors → không có giao dịch', () => {
    expect(calculateSettlements([
      bal('A', 'A', 100000), bal('B', 'B', 50000),
    ])).toEqual([]);
  });

  it('chỉ có debtors → không có giao dịch', () => {
    expect(calculateSettlements([
      bal('A', 'A', -100000), bal('B', 'B', -50000),
    ])).toEqual([]);
  });

  it('mảng rỗng → không crash', () => {
    expect(calculateSettlements([])).toEqual([]);
  });

  it('1 người → không có giao dịch', () => {
    expect(calculateSettlements([bal('A', 'A', 100000)])).toEqual([]);
  });

  // ── Kịch bản thực tế: Đà Lạt 5 người ──

  it('Đà Lạt: An +1.5tr, Chi/Dũng/Em mỗi người -500k → 3 giao dịch', () => {
    const result = calculateSettlements([
      bal('an', 'An', 1500000),
      bal('binh', 'Bình', 0),
      bal('chi', 'Chi', -500000),
      bal('dung', 'Dũng', -500000),
      bal('em', 'Em', -500000),
    ]);
    // 3 giao dịch: Chi→An, Dũng→An, Em→An (mỗi người 500k)
    expect(result.length).toBe(3);
    expect(result.every((t) => t.to === 'an')).toBe(true);
    expect(result.every((t) => t.amount === 500000)).toBe(true);
    // Bình balance = 0 → không xuất hiện
    expect(result.every((t) => t.from !== 'binh' && t.to !== 'binh')).toBe(true);
  });
});
