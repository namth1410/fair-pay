/**
 * Pure function — giải thích vì sao số dư của một thành viên trong trip lại bằng X.
 *
 * Sinh ra danh sách dòng (line) liên quan tới `myMemberId` từ expenses + payments,
 * mỗi dòng có `delta` (signed) đóng góp vào balance hiện tại. Tổng delta = balance.
 *
 * Nguyên tắc: chỉ trả data có cấu trúc — formatting tiếng Việt do component đảm nhiệm.
 */

export type ExplanationKind =
  | 'expense_paid_only'      // mình trả, không có trong splits
  | 'expense_paid_and_split' // mình trả VÀ có phần phải chịu
  | 'expense_split_only'     // người khác trả, mình có phần phải chịu
  | 'payment_sent'           // mình thanh toán cho người khác
  | 'payment_received';      // người khác thanh toán cho mình

export interface ExplanationLine {
  kind: ExplanationKind;
  /** Tiêu đề hiển thị: tên expense, hoặc nhãn ngắn cho payment. */
  title: string;
  /** Tổng số tiền của expense (paid total) hoặc payment. */
  amount: number;
  /** Phần mình phải chịu (chỉ với expense_paid_and_split / expense_split_only). */
  myShare?: number;
  /** Tên người liên quan (payer cho split_only, người nhận/người gửi cho payment). */
  counterpartName?: string;
  /** Đóng góp signed vào balance hiện tại (>0 = được nợ thêm, <0 = nợ thêm). */
  delta: number;
  /** ISO date string nếu có — dùng để sort. */
  date?: string;
}

export interface MyBalanceExplanation {
  myMemberId: string;
  totalBalance: number;
  lines: ExplanationLine[];
}

export interface ExpenseInput {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
  date?: string;
  splits: { memberId: string; amount: number }[];
}

export interface PaymentInput {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date?: string;
}

export interface MemberInput {
  id: string;
  displayName: string;
}

export function explainMyTripBalance(
  myMemberId: string,
  members: MemberInput[],
  expenses: ExpenseInput[],
  payments: PaymentInput[]
): MyBalanceExplanation {
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const lines: ExplanationLine[] = [];

  for (const exp of expenses) {
    const iPaid = exp.paidBy === myMemberId;
    const mySplit = exp.splits.find((s) => s.memberId === myMemberId);

    if (!iPaid && !mySplit) continue;

    if (iPaid && mySplit) {
      const myShare = mySplit.amount;
      const delta = exp.amount - myShare;
      lines.push({
        kind: 'expense_paid_and_split',
        title: exp.title,
        amount: exp.amount,
        myShare,
        delta,
        date: exp.date,
      });
    } else if (iPaid) {
      lines.push({
        kind: 'expense_paid_only',
        title: exp.title,
        amount: exp.amount,
        delta: exp.amount,
        date: exp.date,
      });
    } else if (mySplit) {
      const myShare = mySplit.amount;
      lines.push({
        kind: 'expense_split_only',
        title: exp.title,
        amount: exp.amount,
        myShare,
        counterpartName: nameOf.get(exp.paidBy) ?? '?',
        delta: -myShare,
        date: exp.date,
      });
    }
  }

  for (const pay of payments) {
    if (pay.fromMemberId === myMemberId) {
      lines.push({
        kind: 'payment_sent',
        title: 'Bạn đã thanh toán',
        amount: pay.amount,
        counterpartName: nameOf.get(pay.toMemberId) ?? '?',
        delta: pay.amount,
        date: pay.date,
      });
    } else if (pay.toMemberId === myMemberId) {
      lines.push({
        kind: 'payment_received',
        title: 'Đã nhận thanh toán',
        amount: pay.amount,
        counterpartName: nameOf.get(pay.fromMemberId) ?? '?',
        delta: -pay.amount,
        date: pay.date,
      });
    }
  }

  lines.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const totalBalance = lines.reduce((sum, l) => sum + l.delta, 0);

  return { myMemberId, totalBalance, lines };
}
