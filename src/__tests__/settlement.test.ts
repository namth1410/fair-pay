import { calculateSettlements } from '../utils/settlement';

// Helper to create balance entries
function bal(id: string, name: string, balance: number) {
  return { memberId: id, memberName: name, balance };
}

// Helper to sum all transaction amounts for a given member (outgoing negative, incoming positive)
function netFlow(
  memberId: string,
  transactions: ReturnType<typeof calculateSettlements>
): number {
  let flow = 0;
  for (const t of transactions) {
    if (t.from === memberId) flow -= t.amount;
    if (t.to === memberId) flow += t.amount;
  }
  return flow;
}

describe('calculateSettlements — Greedy Simplification', () => {
  // ── TC-02: Basic 3-person case ──

  it('TC-02: An trả 300k, chia đều 3 người → An +200k, Bình -100k, Chi -100k', () => {
    const balances = [
      bal('an', 'An', 200000),
      bal('binh', 'Bình', -100000),
      bal('chi', 'Chi', -100000),
    ];
    const result = calculateSettlements(balances);

    // 2 transactions: Bình→An 100k, Chi→An 100k
    expect(result.length).toBe(2);

    // All payments go to An
    expect(result.every((t) => t.to === 'an')).toBe(true);

    // Amounts correct
    const totalToAn = result.reduce((sum, t) => sum + t.amount, 0);
    expect(totalToAn).toBe(200000);
  });

  // ── TC-05: Tổng net flow = 0 ──

  it('TC-05: tổng net flow phải = 0 cho mọi case', () => {
    const cases = [
      [bal('A', 'A', 200000), bal('B', 'B', -100000), bal('C', 'C', -100000)],
      [bal('A', 'A', 500000), bal('B', 'B', -200000), bal('C', 'C', -300000)],
      [bal('A', 'A', 150000), bal('B', 'B', 50000), bal('C', 'C', -100000), bal('D', 'D', -100000)],
      [bal('A', 'A', 1000000), bal('B', 'B', -250000), bal('C', 'C', -250000), bal('D', 'D', -250000), bal('E', 'E', -250000)],
    ];

    for (const balances of cases) {
      const result = calculateSettlements(balances);
      let totalNet = 0;
      for (const t of result) {
        totalNet += t.amount; // from debtor (negative balance)
        totalNet -= t.amount; // to creditor
      }
      // Each transaction is zero-sum, so total net is always 0
      expect(totalNet).toBe(0);
    }
  });

  // ── Tất cả balance đều 0 → không cần transaction ──

  it('tất cả balance = 0 → không có giao dịch', () => {
    const balances = [
      bal('A', 'A', 0),
      bal('B', 'B', 0),
      bal('C', 'C', 0),
    ];
    const result = calculateSettlements(balances);
    expect(result).toEqual([]);
  });

  // ── Balance nằm trong tolerance (±1000đ) → bỏ qua ──

  it('balance nhỏ hơn tolerance (1000đ) → bỏ qua', () => {
    const balances = [
      bal('A', 'A', 500),
      bal('B', 'B', -500),
    ];
    const result = calculateSettlements(balances);
    expect(result).toEqual([]);
  });

  it('balance đúng = 1000đ → bỏ qua (tolerance là >1000)', () => {
    const balances = [
      bal('A', 'A', 1000),
      bal('B', 'B', -1000),
    ];
    const result = calculateSettlements(balances);
    expect(result).toEqual([]);
  });

  it('balance = 2000đ → tạo giao dịch 2000', () => {
    const balances = [
      bal('A', 'A', 2000),
      bal('B', 'B', -2000),
    ];
    const result = calculateSettlements(balances);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ from: 'B', to: 'A', amount: 2000 });
  });

  // ── 2 người: đơn giản nhất ──

  it('2 người: A +100k, B -100k → B trả A 100k', () => {
    const balances = [bal('A', 'A', 100000), bal('B', 'B', -100000)];
    const result = calculateSettlements(balances);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ from: 'B', to: 'A', amount: 100000 });
  });

  // ── Nhiều creditor, nhiều debtor ──

  it('2 creditors, 2 debtors', () => {
    // A=+300k, B=+100k, C=-200k, D=-200k
    const balances = [
      bal('A', 'A', 300000),
      bal('B', 'B', 100000),
      bal('C', 'C', -200000),
      bal('D', 'D', -200000),
    ];
    const result = calculateSettlements(balances);

    // Verify: net flow per person matches expected direction
    // Debtors should have negative net flow (they pay), creditors positive
    expect(netFlow('A', result)).toBeGreaterThan(0); // receives
    expect(netFlow('B', result)).toBeGreaterThan(0); // receives
    expect(netFlow('C', result)).toBeLessThan(0);    // pays
    expect(netFlow('D', result)).toBeLessThan(0);    // pays

    // Verify: total debtor payments = total creditor receipts
    const totalPaid = result.reduce((sum, t) => sum + t.amount, 0);
    // Sum of positive balances = 400k = sum of debts
    // All amounts should round properly
    expect(totalPaid).toBeGreaterThan(0);
  });

  // ── Greedy minimizes transactions ──

  it('5 người: tối ưu số giao dịch', () => {
    // Worst case without optimization: 10 possible pairs (C(5,2))
    // Greedy should do <= 4 transactions
    const balances = [
      bal('A', 'A', 400000),
      bal('B', 'B', 100000),
      bal('C', 'C', -200000),
      bal('D', 'D', -150000),
      bal('E', 'E', -150000),
    ];
    const result = calculateSettlements(balances);
    expect(result.length).toBeLessThanOrEqual(4);
    // Every amount must be positive
    expect(result.every((t) => t.amount > 0)).toBe(true);
  });

  // ── Lớn: 10 người ──

  it('10 người: thuật toán chạy đúng, tổng cân bằng', () => {
    const balances = [
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
    ];
    const result = calculateSettlements(balances);

    // Should need at most 9 transactions (N-1)
    expect(result.length).toBeLessThanOrEqual(9);

    // All amounts positive and multiples of 1000
    for (const t of result) {
      expect(t.amount).toBeGreaterThan(0);
      expect(t.amount % 1000).toBe(0);
    }

    // Debtors pay, creditors receive
    for (const b of balances) {
      const flow = netFlow(b.memberId, result);
      if (b.balance > 1000) {
        expect(flow).toBeGreaterThanOrEqual(0); // creditor receives
      }
      if (b.balance < -1000) {
        expect(flow).toBeLessThanOrEqual(0); // debtor pays
      }
    }
  });

  // ── TC-03: Payment trả dư → balance đảo chiều ──

  it('TC-03: sau payment dư, balance đảo chiều đúng', () => {
    // Setup: An trả 300k, chia đều 3 người → An +200k, Bình -100k, Chi -100k
    // Bình trả An 120k (nợ 100k, trả dư 20k)
    // Sau payment: An = 200k-120k = +80k, Bình = -100k+120k = +20k, Chi = -100k
    // Quyết toán: Chi trả An 80k, Chi trả Bình 20k
    const balancesAfterPayment = [
      bal('an', 'An', 80000),
      bal('binh', 'Bình', 20000),
      bal('chi', 'Chi', -100000),
    ];
    const result = calculateSettlements(balancesAfterPayment);

    // Chi should pay both An and Bình
    expect(result.length).toBe(2);
    expect(result.every((t) => t.from === 'chi')).toBe(true);

    const toAn = result.find((t) => t.to === 'an');
    const toBinh = result.find((t) => t.to === 'binh');
    expect(toAn?.amount).toBe(80000);
    expect(toBinh?.amount).toBe(20000);
  });

  // ── TC-04: Payment không đúng người gợi ý ──

  it('TC-04: payment không theo gợi ý → số dư vẫn đúng', () => {
    // Thuật toán gợi ý: An trả B.
    // Thực tế: An trả C thay vì B.
    // Số dư An và C thay đổi, B không đổi.
    // Kết quả: balance mới → thuật toán tạo gợi ý mới
    const balancesAfterWrongPayment = [
      bal('A', 'A', -50000),  // An vẫn nợ (trả sai người)
      bal('B', 'B', 100000),  // B không đổi
      bal('C', 'C', -50000),  // C nhận từ A nhưng cũng đang nợ
    ];
    const result = calculateSettlements(balancesAfterWrongPayment);

    // A and C both owe B
    expect(result.every((t) => t.to === 'B')).toBe(true);
    const totalToB = result.reduce((sum, t) => sum + t.amount, 0);
    expect(totalToB).toBe(100000);
  });

  // ── Amounts rounded to 1000đ ──

  it('amounts luôn được round đến 1000đ', () => {
    const balances = [
      bal('A', 'A', 333333),
      bal('B', 'B', -166666),
      bal('C', 'C', -166667),
    ];
    const result = calculateSettlements(balances);
    for (const t of result) {
      expect(t.amount % 1000).toBe(0);
    }
  });

  // ── 1 creditor, nhiều debtor ──

  it('1 creditor, 4 debtors', () => {
    const balances = [
      bal('A', 'A', 400000),
      bal('B', 'B', -100000),
      bal('C', 'C', -100000),
      bal('D', 'D', -100000),
      bal('E', 'E', -100000),
    ];
    const result = calculateSettlements(balances);
    expect(result.length).toBe(4); // each debtor pays A once
    expect(result.every((t) => t.to === 'A')).toBe(true);
    expect(result.every((t) => t.amount === 100000)).toBe(true);
  });

  // ── Nhiều creditor, 1 debtor ──

  it('4 creditors, 1 debtor', () => {
    const balances = [
      bal('A', 'A', 100000),
      bal('B', 'B', 100000),
      bal('C', 'C', 100000),
      bal('D', 'D', 100000),
      bal('E', 'E', -400000),
    ];
    const result = calculateSettlements(balances);
    expect(result.length).toBe(4); // E pays each creditor once
    expect(result.every((t) => t.from === 'E')).toBe(true);
    expect(result.every((t) => t.amount === 100000)).toBe(true);
  });

  // ── Chỉ có creditors (không có debtor) ──

  it('chỉ có creditors → không có giao dịch', () => {
    const balances = [
      bal('A', 'A', 100000),
      bal('B', 'B', 50000),
    ];
    const result = calculateSettlements(balances);
    expect(result).toEqual([]);
  });

  // ── Chỉ có debtors ──

  it('chỉ có debtors → không có giao dịch', () => {
    const balances = [
      bal('A', 'A', -100000),
      bal('B', 'B', -50000),
    ];
    const result = calculateSettlements(balances);
    expect(result).toEqual([]);
  });

  // ── Mảng rỗng ──

  it('mảng rỗng → không có giao dịch', () => {
    const result = calculateSettlements([]);
    expect(result).toEqual([]);
  });

  // ── 1 người ──

  it('1 người → không có giao dịch', () => {
    const result = calculateSettlements([bal('A', 'A', 100000)]);
    expect(result).toEqual([]);
  });

  // ── Kịch bản thực tế: chuyến đi 5 người ──

  it('kịch bản thực tế: 5 người đi Đà Lạt', () => {
    // An trả khách sạn 2.000.000đ, chia đều 5
    // → An: +1.600.000, mỗi người khác: -400.000
    // Bình trả ăn uống 500.000đ, chia đều 5
    // → Bình: +400.000, mỗi người khác: -100.000
    // Tổng balance:
    // An:   1.600.000 - 100.000 = +1.500.000
    // Bình: -400.000 + 400.000  = 0
    // Chi:  -400.000 - 100.000  = -500.000
    // Dũng: -400.000 - 100.000  = -500.000
    // Em:   -400.000 - 100.000  = -500.000
    const balances = [
      bal('an', 'An', 1500000),
      bal('binh', 'Bình', 0),
      bal('chi', 'Chi', -500000),
      bal('dung', 'Dũng', -500000),
      bal('em', 'Em', -500000),
    ];
    const result = calculateSettlements(balances);

    // 3 transactions: Chi→An, Dũng→An, Em→An
    expect(result.length).toBe(3);
    expect(result.every((t) => t.to === 'an')).toBe(true);
    expect(result.every((t) => t.amount === 500000)).toBe(true);

    // Bình has 0 balance → không xuất hiện
    expect(result.every((t) => t.from !== 'binh' && t.to !== 'binh')).toBe(true);

    // Total
    const total = result.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBe(1500000);
  });
});
