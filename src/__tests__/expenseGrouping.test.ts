import type { ExpenseWithSplits } from '../services/expense.service';
import { groupExpensesByDay } from '../utils/expenseGrouping';

function vn(iso: string): string {
  // Trả về ISO UTC chuẩn để giả lập service trả về (Postgres timestamptz → UTC string)
  return new Date(`${iso}+07:00`).toISOString();
}

function makeExpense(id: string, date: string): ExpenseWithSplits {
  return {
    id,
    trip_id: 't1',
    group_id: 'g1',
    title: `e-${id}`,
    amount: 100_000,
    category: 'other',
    paid_by: 'm1',
    split_type: 'equal',
    date,
    note: null,
    image_url: null,
    created_by: 'u1',
    version: 1,
    created_at: date,
    deleted_at: null,
    expense_splits: [],
  };
}

describe('groupExpensesByDay', () => {
  const now = new Date(`2026-05-13T15:30:00+07:00`);

  it('returns empty array for no expenses', () => {
    expect(groupExpensesByDay([], now)).toEqual([]);
  });

  it('groups 3 expenses on same day into 1 section', () => {
    const exps = [
      makeExpense('a', vn('2026-05-13T14:00:00')),
      makeExpense('b', vn('2026-05-13T10:00:00')),
      makeExpense('c', vn('2026-05-13T08:00:00')),
    ];
    const out = groupExpensesByDay(exps, now);
    expect(out).toHaveLength(1);
    const s0 = out[0]!;
    expect(s0.title).toBe('Hôm nay');
    expect(s0.dayKey).toBe('2026-05-13');
    expect(s0.data.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('groups 5 expenses across 3 days into 3 sections, DESC by dayKey', () => {
    const exps = [
      makeExpense('a', vn('2026-05-13T14:00:00')),
      makeExpense('b', vn('2026-05-13T08:00:00')),
      makeExpense('c', vn('2026-05-12T20:00:00')),
      makeExpense('d', vn('2026-05-10T15:00:00')),
      makeExpense('e', vn('2026-05-10T09:00:00')),
    ];
    const out = groupExpensesByDay(exps, now);
    expect(out).toHaveLength(3);
    const [s0, s1, s2] = [out[0]!, out[1]!, out[2]!];
    expect(s0.dayKey).toBe('2026-05-13');
    expect(s0.title).toBe('Hôm nay');
    expect(s0.data).toHaveLength(2);
    expect(s1.dayKey).toBe('2026-05-12');
    expect(s1.title).toBe('Hôm qua');
    expect(s1.data).toHaveLength(1);
    expect(s2.dayKey).toBe('2026-05-10');
    expect(s2.title).toBe('10/05/2026');
    expect(s2.data).toHaveLength(2);
  });

  it('splits midnight boundary into separate sections', () => {
    const exps = [
      makeExpense('today', vn('2026-05-13T00:01:00')),
      makeExpense('yesterday', vn('2026-05-12T23:59:00')),
    ];
    const out = groupExpensesByDay(exps, now);
    expect(out).toHaveLength(2);
    const [s0, s1] = [out[0]!, out[1]!];
    expect(s0.title).toBe('Hôm nay');
    expect(s0.data[0]!.id).toBe('today');
    expect(s1.title).toBe('Hôm qua');
    expect(s1.data[0]!.id).toBe('yesterday');
  });

  it('preserves input order within section', () => {
    const exps = [
      makeExpense('first', vn('2026-05-13T14:00:00')),
      makeExpense('second', vn('2026-05-13T13:00:00')),
      makeExpense('third', vn('2026-05-13T12:00:00')),
    ];
    const out = groupExpensesByDay(exps, now);
    expect(out[0]!.data.map((e) => e.id)).toEqual(['first', 'second', 'third']);
  });
});
