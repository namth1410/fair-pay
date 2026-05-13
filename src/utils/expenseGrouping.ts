import type { ExpenseWithSplits } from '../services/expense.service';
import { formatDateSection, getVnDayKey } from './format';

export interface ExpenseSection {
  /** "Hôm nay" | "Hôm qua" | "DD/MM/YYYY" */
  title: string;
  /** "YYYY-MM-DD" theo VN timezone — stable key cho SectionList */
  dayKey: string;
  data: ExpenseWithSplits[];
}

/**
 * Group expenses theo ngày local (Asia/Ho_Chi_Minh). Input giả định đã sort DESC theo
 * date + created_at (service đã order). Output sections DESC theo dayKey, data trong
 * mỗi section giữ thứ tự input.
 */
export function groupExpensesByDay(
  expenses: ExpenseWithSplits[],
  now: Date = new Date(),
): ExpenseSection[] {
  if (expenses.length === 0) return [];

  const map = new Map<string, ExpenseSection>();
  for (const exp of expenses) {
    const d = new Date(exp.date);
    const dayKey = getVnDayKey(d);
    let section = map.get(dayKey);
    if (!section) {
      section = {
        title: formatDateSection(d, now),
        dayKey,
        data: [],
      };
      map.set(dayKey, section);
    }
    section.data.push(exp);
  }

  return Array.from(map.values()).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
}
