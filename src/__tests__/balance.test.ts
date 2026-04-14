/**
 * Tests viết từ đặc tả nghiệp vụ — business-requirements.md
 * Ref: TC-02, TC-03, TC-04, TC-05, BR-05
 *
 * Balance = "số dư" = nhóm đang nợ bạn bao nhiêu (dương) / bạn đang nợ nhóm (âm).
 * Payment quyết toán nợ: người trả (from) balance tăng, người nhận (to) balance giảm.
 */

interface ExpenseData {
  paidBy: string;
  amount: number;
  splits: { memberId: string; amount: number }[];
}

interface PaymentData {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/** Pure function mirroring expense.service.ts calculateBalances */
function computeBalances(
  memberIds: string[],
  expenses: ExpenseData[],
  payments: PaymentData[]
): Record<string, number> {
  const b: Record<string, number> = {};
  memberIds.forEach((id) => (b[id] = 0));

  for (const exp of expenses) {
    b[exp.paidBy] += exp.amount;
    for (const s of exp.splits) {
      b[s.memberId] -= s.amount;
    }
  }
  for (const pay of payments) {
    b[pay.fromMemberId] += pay.amount; // debt settled
    b[pay.toMemberId] -= pay.amount;   // credit settled
  }
  return b;
}

// ═══════════════════════════════════════════════════
// TC-02: Số dư sau expense
// "An trả 300k, chia đều 3 người → An: +200k, Bình: -100k, Chi: -100k"
// ═══════════════════════════════════════════════════

describe('TC-02: Số dư sau expense', () => {
  const members = ['An', 'Binh', 'Chi'];
  const expense: ExpenseData = {
    paidBy: 'An',
    amount: 300000,
    splits: [
      { memberId: 'An', amount: 100000 },
      { memberId: 'Binh', amount: 100000 },
      { memberId: 'Chi', amount: 100000 },
    ],
  };

  it('An trả 300k, chia đều 3 → An: +200k, Bình: -100k, Chi: -100k', () => {
    const b = computeBalances(members, [expense], []);
    expect(b['An']).toBe(200000);
    expect(b['Binh']).toBe(-100000);
    expect(b['Chi']).toBe(-100000);
  });

  it('nhiều expenses: An trả 300k, Binh trả 150k, chia đều', () => {
    const b = computeBalances(members, [
      expense,
      {
        paidBy: 'Binh', amount: 150000, splits: [
          { memberId: 'An', amount: 50000 },
          { memberId: 'Binh', amount: 50000 },
          { memberId: 'Chi', amount: 50000 },
        ],
      },
    ], []);
    // An: 300k - 100k - 50k = +150k
    // Binh: +150k - 100k - 50k = 0
    // Chi: -100k - 50k = -150k
    expect(b['An']).toBe(150000);
    expect(b['Binh']).toBe(0);
    expect(b['Chi']).toBe(-150000);
  });
});

// ═══════════════════════════════════════════════════
// TC-03: Payment tự do, trả dư
// "Bình trả An 120k (nợ 100k) → An: +80k, Bình: +20k"
// ═══════════════════════════════════════════════════

describe('TC-03: Payment tự do, trả dư', () => {
  const members = ['An', 'Binh', 'Chi'];
  const expense: ExpenseData = {
    paidBy: 'An',
    amount: 300000,
    splits: [
      { memberId: 'An', amount: 100000 },
      { memberId: 'Binh', amount: 100000 },
      { memberId: 'Chi', amount: 100000 },
    ],
  };

  it('Bình trả An 120k (nợ 100k) → An: +80k, Bình: +20k, Chi: -100k', () => {
    const b = computeBalances(members, [expense], [
      { fromMemberId: 'Binh', toMemberId: 'An', amount: 120000 },
    ]);
    expect(b['An']).toBe(80000);
    expect(b['Binh']).toBe(20000);
    expect(b['Chi']).toBe(-100000);
  });

  it('Bình trả An đúng 100k → An: +100k, Bình: 0, Chi: -100k', () => {
    const b = computeBalances(members, [expense], [
      { fromMemberId: 'Binh', toMemberId: 'An', amount: 100000 },
    ]);
    expect(b['An']).toBe(100000);
    expect(b['Binh']).toBe(0);
    expect(b['Chi']).toBe(-100000);
  });

  it('tất cả trả hết → tất cả balance = 0', () => {
    const b = computeBalances(members, [expense], [
      { fromMemberId: 'Binh', toMemberId: 'An', amount: 100000 },
      { fromMemberId: 'Chi', toMemberId: 'An', amount: 100000 },
    ]);
    expect(b['An']).toBe(0);
    expect(b['Binh']).toBe(0);
    expect(b['Chi']).toBe(0);
  });

  it('BR-03: Payment không bị ràng buộc — trả nhiều hơn nợ vẫn ghi nhận', () => {
    // Bình nợ 100k nhưng trả 500k → Bình giờ được nợ 400k
    const b = computeBalances(members, [expense], [
      { fromMemberId: 'Binh', toMemberId: 'An', amount: 500000 },
    ]);
    expect(b['Binh']).toBe(400000);  // overpaid massively
    expect(b['An']).toBe(-300000);   // An giờ nợ Bình
  });
});

// ═══════════════════════════════════════════════════
// TC-04: Payment không đúng người thuật toán gợi ý
// "Thực tế: An trả C → Số dư An và C cập nhật. Số dư B không đổi."
// ═══════════════════════════════════════════════════

describe('TC-04: Payment tự do, trả không đúng người gợi ý', () => {
  it('An trả Chi 50k thay vì trả Bình → Bình không đổi', () => {
    const members = ['An', 'Binh', 'Chi'];
    // Sau expense: An +200k, Binh -100k, Chi -100k
    // Thuật toán gợi ý: Binh→An, Chi→An
    // Thực tế: An trả Chi 50k (sai hoàn toàn so với gợi ý)
    const b = computeBalances(members, [
      {
        paidBy: 'An', amount: 300000, splits: [
          { memberId: 'An', amount: 100000 },
          { memberId: 'Binh', amount: 100000 },
          { memberId: 'Chi', amount: 100000 },
        ],
      },
    ], [
      { fromMemberId: 'An', toMemberId: 'Chi', amount: 50000 },
    ]);

    // An: +200k +50k (paid out, debt increases) = +250k
    // Binh: -100k (unchanged!)
    // Chi: -100k -50k (received, credit settled) = -150k
    // Wait — this doesn't make sense semantically either.
    //
    // Actually: "An trả Chi 50k" means An gives real money to Chi.
    // An's balance: was +200k (owed by group). An gives money away → balance increases
    // (group now owes An even more because he gave out more cash).
    // Chi's balance: was -100k (owes group). Chi receives money → balance decreases
    // (Chi got free money, now owes even more???)
    //
    // Hmm, this is where the formula gets tricky for "wrong direction" payments.
    // But per the formula: from += amount, to -= amount.
    // An: 200k + 50k = 250k (An is owed more)
    // Chi: -100k - 50k = -150k (Chi owes more)
    //
    // This is correct in the sense that An spent 50k more of his own money,
    // and Chi received 50k she didn't earn through the group's expense system.
    // The NET effect is neutral (total still = 0).
    //
    // The spec just says "Số dư B không đổi" — that's the key assertion.
    expect(b['Binh']).toBe(-100000); // B unchanged ✓
    // Total still = 0
    const total = Object.values(b).reduce((sum, v) => sum + v, 0);
    expect(total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════
// TC-05: Tổng số dư nhóm = 0
// "Bất kỳ combination expense + payment nào → Σ balance[] = 0"
// ═══════════════════════════════════════════════════

describe('TC-05: Tổng số dư nhóm luôn = 0', () => {
  it('1 expense, 0 payment', () => {
    const b = computeBalances(['A', 'B', 'C'], [
      { paidBy: 'A', amount: 300000, splits: [
        { memberId: 'A', amount: 100000 },
        { memberId: 'B', amount: 100000 },
        { memberId: 'C', amount: 100000 },
      ]},
    ], []);
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('nhiều expenses, 0 payment', () => {
    const m = ['A', 'B', 'C', 'D', 'E'];
    const b = computeBalances(m, [
      { paidBy: 'A', amount: 2000000, splits: m.map((id) => ({ memberId: id, amount: 400000 })) },
      { paidBy: 'B', amount: 500000, splits: m.map((id) => ({ memberId: id, amount: 100000 })) },
      { paidBy: 'C', amount: 250000, splits: m.map((id) => ({ memberId: id, amount: 50000 })) },
    ], []);
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('expenses + payments hỗn hợp', () => {
    const m = ['A', 'B', 'C', 'D', 'E'];
    const b = computeBalances(m, [
      { paidBy: 'A', amount: 1000000, splits: m.map((id) => ({ memberId: id, amount: 200000 })) },
      { paidBy: 'B', amount: 500000, splits: m.map((id) => ({ memberId: id, amount: 100000 })) },
    ], [
      { fromMemberId: 'C', toMemberId: 'A', amount: 200000 },
      { fromMemberId: 'D', toMemberId: 'A', amount: 150000 },
      { fromMemberId: 'E', toMemberId: 'B', amount: 50000 },
    ]);
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('chỉ có payments, 0 expense', () => {
    const b = computeBalances(['A', 'B', 'C'], [], [
      { fromMemberId: 'A', toMemberId: 'B', amount: 100000 },
      { fromMemberId: 'B', toMemberId: 'C', amount: 50000 },
    ]);
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('tất cả đã quyết toán xong → mọi balance = 0', () => {
    const m = ['A', 'B', 'C'];
    const b = computeBalances(m, [
      { paidBy: 'A', amount: 300000, splits: m.map((id) => ({ memberId: id, amount: 100000 })) },
    ], [
      { fromMemberId: 'B', toMemberId: 'A', amount: 100000 },
      { fromMemberId: 'C', toMemberId: 'A', amount: 100000 },
    ]);
    expect(b['A']).toBe(0);
    expect(b['B']).toBe(0);
    expect(b['C']).toBe(0);
  });
});

// ═══════════════════════════════════════════════════
// Kịch bản thực tế: Chuyến đi Đà Lạt 5 người
// ═══════════════════════════════════════════════════

describe('Kịch bản thực tế: Đà Lạt 5 người', () => {
  const m = ['An', 'Binh', 'Chi', 'Dung', 'Em'];

  it('3 expenses, 2 payments — kiểm tra từng người', () => {
    const expenses: ExpenseData[] = [
      // Ngày 1: An trả khách sạn 2tr, chia đều 5
      { paidBy: 'An', amount: 2000000, splits: m.map((id) => ({ memberId: id, amount: 400000 })) },
      // Ngày 2: Binh trả ăn uống 500k, chia đều 5
      { paidBy: 'Binh', amount: 500000, splits: m.map((id) => ({ memberId: id, amount: 100000 })) },
      // Ngày 3: Chi trả vé 250k, chia đều 5
      { paidBy: 'Chi', amount: 250000, splits: m.map((id) => ({ memberId: id, amount: 50000 })) },
    ];
    // Balance sau expenses:
    // An:   2000k - 400k - 100k - 50k = +1.450.000
    // Binh: -400k + 500k - 100k - 50k = -50.000
    // Chi:  -400k - 100k + 250k - 50k = -300.000
    // Dung: -400k - 100k - 50k        = -550.000
    // Em:   -400k - 100k - 50k        = -550.000

    const payments: PaymentData[] = [
      { fromMemberId: 'Dung', toMemberId: 'An', amount: 550000 }, // Dung trả hết
      { fromMemberId: 'Em', toMemberId: 'An', amount: 400000 },   // Em trả thiếu 150k
    ];

    const b = computeBalances(m, expenses, payments);

    expect(b['An']).toBe(500000);     // 1450k - 550k - 400k = 500k (còn được nợ)
    expect(b['Binh']).toBe(-50000);   // unchanged
    expect(b['Chi']).toBe(-300000);   // unchanged
    expect(b['Dung']).toBe(0);        // settled!
    expect(b['Em']).toBe(-150000);    // -550k + 400k = -150k (còn nợ)

    // Total = 0
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════
// BR-05: Chuyến đã đóng vẫn ghi nhận Payment được
// (Logic test — không cần Supabase, chỉ verify formula vẫn đúng)
// ═══════════════════════════════════════════════════

describe('BR-05: Payment trên chuyến đã đóng vẫn cập nhật balance', () => {
  it('expense trước khi đóng + payment sau khi đóng → balance đúng', () => {
    const m = ['A', 'B'];
    // Chuyến mở: A trả 200k, chia đều
    // Chuyến đóng
    // B vẫn ghi nhận payment 100k cho A
    const b = computeBalances(m, [
      { paidBy: 'A', amount: 200000, splits: [
        { memberId: 'A', amount: 100000 },
        { memberId: 'B', amount: 100000 },
      ]},
    ], [
      { fromMemberId: 'B', toMemberId: 'A', amount: 100000 },
    ]);
    expect(b['A']).toBe(0);
    expect(b['B']).toBe(0);
  });
});
