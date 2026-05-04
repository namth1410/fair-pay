import { computeBalances } from '../utils/balance';
import {
  type ExpenseInput,
  explainMyTripBalance,
  type PaymentInput,
} from '../utils/explainBalance';

const members = [
  { id: 'A', displayName: 'An' },
  { id: 'B', displayName: 'Binh' },
  { id: 'C', displayName: 'Chi' },
];

describe('explainMyTripBalance — tổng delta khớp với computeBalances', () => {
  it('expense + payment hỗn hợp: totalBalance == balance từ computeBalances', () => {
    const expenses: ExpenseInput[] = [
      // An trả 300k, chia đều 3
      {
        id: 'e1', title: 'Ăn tối', amount: 300_000, paidBy: 'A', date: '2026-04-20',
        splits: [
          { memberId: 'A', amount: 100_000 },
          { memberId: 'B', amount: 100_000 },
          { memberId: 'C', amount: 100_000 },
        ],
      },
      // Binh trả 240k, chia A+C
      {
        id: 'e2', title: 'Taxi', amount: 240_000, paidBy: 'B', date: '2026-04-21',
        splits: [
          { memberId: 'A', amount: 120_000 },
          { memberId: 'C', amount: 120_000 },
        ],
      },
    ];
    const payments: PaymentInput[] = [
      // A trả Binh 50k
      { id: 'p1', fromMemberId: 'A', toMemberId: 'B', amount: 50_000, date: '2026-04-22' },
    ];

    const explanation = explainMyTripBalance('A', members, expenses, payments);
    const balances = computeBalances(
      members.map((m) => ({ id: m.id, displayName: m.displayName })),
      expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount, splits: e.splits })),
      payments.map((p) => ({ fromMemberId: p.fromMemberId, toMemberId: p.toMemberId, amount: p.amount })),
    );
    const myBalance = balances.find((b) => b.memberId === 'A')!.balance;

    expect(explanation.totalBalance).toBe(myBalance);
    // A: paid 300k - chịu 100k (Ăn tối) - chịu 120k (Taxi) + 50k (paid Binh) = +130k
    expect(explanation.totalBalance).toBe(130_000);
  });
});

describe('explainMyTripBalance — phân loại line theo kind', () => {
  const expenses: ExpenseInput[] = [
    // A trả + chịu 100k
    {
      id: 'e1', title: 'Ăn', amount: 300_000, paidBy: 'A',
      splits: [
        { memberId: 'A', amount: 100_000 },
        { memberId: 'B', amount: 100_000 },
        { memberId: 'C', amount: 100_000 },
      ],
    },
    // A trả nhưng không có trong splits
    {
      id: 'e2', title: 'Quà tặng', amount: 100_000, paidBy: 'A',
      splits: [
        { memberId: 'B', amount: 50_000 },
        { memberId: 'C', amount: 50_000 },
      ],
    },
    // Binh trả, A có trong splits
    {
      id: 'e3', title: 'Taxi', amount: 200_000, paidBy: 'B',
      splits: [
        { memberId: 'A', amount: 100_000 },
        { memberId: 'B', amount: 100_000 },
      ],
    },
    // Không liên quan đến A
    {
      id: 'e4', title: 'Cà phê', amount: 60_000, paidBy: 'B',
      splits: [
        { memberId: 'B', amount: 30_000 },
        { memberId: 'C', amount: 30_000 },
      ],
    },
  ];
  const payments: PaymentInput[] = [
    { id: 'p1', fromMemberId: 'A', toMemberId: 'B', amount: 30_000 },
    { id: 'p2', fromMemberId: 'C', toMemberId: 'A', amount: 20_000 },
    { id: 'p3', fromMemberId: 'B', toMemberId: 'C', amount: 10_000 }, // không liên quan A
  ];

  const explanation = explainMyTripBalance('A', members, expenses, payments);

  it('bỏ qua các expense/payment không liên quan tới mình', () => {
    expect(explanation.lines.find((l) => l.title === 'Cà phê')).toBeUndefined();
    expect(explanation.lines.length).toBe(5); // e1, e2, e3, p1, p2
  });

  it('expense_paid_and_split: title + delta = amount - myShare', () => {
    const line = explanation.lines.find((l) => l.title === 'Ăn')!;
    expect(line.kind).toBe('expense_paid_and_split');
    expect(line.amount).toBe(300_000);
    expect(line.myShare).toBe(100_000);
    expect(line.delta).toBe(200_000);
  });

  it('expense_paid_only: delta = amount, không có myShare', () => {
    const line = explanation.lines.find((l) => l.title === 'Quà tặng')!;
    expect(line.kind).toBe('expense_paid_only');
    expect(line.delta).toBe(100_000);
    expect(line.myShare).toBeUndefined();
  });

  it('expense_split_only: delta = -myShare + counterpartName là payer', () => {
    const line = explanation.lines.find((l) => l.title === 'Taxi')!;
    expect(line.kind).toBe('expense_split_only');
    expect(line.myShare).toBe(100_000);
    expect(line.delta).toBe(-100_000);
    expect(line.counterpartName).toBe('Binh');
  });

  it('payment_sent: delta = +amount + counterpartName là receiver', () => {
    const line = explanation.lines.find((l) => l.kind === 'payment_sent')!;
    expect(line.delta).toBe(30_000);
    expect(line.counterpartName).toBe('Binh');
  });

  it('payment_received: delta = -amount + counterpartName là sender', () => {
    const line = explanation.lines.find((l) => l.kind === 'payment_received')!;
    expect(line.delta).toBe(-20_000);
    expect(line.counterpartName).toBe('Chi');
  });
});

describe('explainMyTripBalance — edge cases', () => {
  it('không có data → totalBalance = 0, lines rỗng', () => {
    const r = explainMyTripBalance('A', members, [], []);
    expect(r.totalBalance).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it('member id không có trong members map → counterpartName = "?"', () => {
    const r = explainMyTripBalance('A', members, [
      {
        id: 'e1', title: 'X', amount: 100_000, paidBy: 'GHOST',
        splits: [{ memberId: 'A', amount: 100_000 }],
      },
    ], []);
    expect(r.lines[0]?.counterpartName).toBe('?');
  });

  it('lines sort theo date desc (mới nhất đầu)', () => {
    const r = explainMyTripBalance('A', members, [
      { id: 'e1', title: 'Cũ', amount: 100_000, paidBy: 'A', date: '2026-04-01',
        splits: [{ memberId: 'A', amount: 100_000 }] },
      { id: 'e2', title: 'Mới', amount: 100_000, paidBy: 'A', date: '2026-04-25',
        splits: [{ memberId: 'A', amount: 100_000 }] },
      { id: 'e3', title: 'Giữa', amount: 100_000, paidBy: 'A', date: '2026-04-10',
        splits: [{ memberId: 'A', amount: 100_000 }] },
    ], []);
    expect(r.lines.map((l) => l.title)).toEqual(['Mới', 'Giữa', 'Cũ']);
  });
});
