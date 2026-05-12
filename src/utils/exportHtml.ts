/**
 * Pure HTML builders cho xuất PDF — không I/O, không React.
 * Caller (service/export.service.ts) dùng `expo-print.printToFileAsync({ html })`
 * để render qua WebView thành PDF.
 *
 * Hai mode:
 *  - buildTripGroupHtml: bản tổng quan cho cả nhóm.
 *  - buildTripPersonHtml: diễn giải tập trung vào 1 thành viên (tận dụng explainMyTripBalance).
 *
 * Tất cả text từ user (tên trip, tên member, title khoản chi, note) ĐỀU phải qua escapeHtml.
 */

import { explainMyTripBalance, type ExplanationLine } from './explainBalance';
import { formatVND } from './format';

export interface ExportMember {
  id: string;
  displayName: string;
  isVirtual: boolean;
}

export interface ExportExpense {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
  date: string;
  note?: string | null;
  splits: { memberId: string; amount: number }[];
}

export interface ExportPayment {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date: string;
  note?: string | null;
}

export interface ExportBalance {
  memberId: string;
  memberName: string;
  balance: number;
}

export interface ExportSettlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface TripExportData {
  tripName: string;
  groupName: string;
  generatedAt: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  members: ExportMember[];
  expenses: ExportExpense[];
  payments: ExportPayment[];
  balances: ExportBalance[];
  settlements: ExportSettlement[];
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = formatDate(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hh}:${mi}`;
}

function memberLabel(memberId: string, members: ExportMember[]): string {
  const m = members.find((x) => x.id === memberId);
  if (!m) return '?';
  return escapeHtml(m.displayName);
}

/** Render danh sách người chia: nếu tất cả split = total/n → "Chia đều cho tất cả". */
function renderSplitsCell(exp: ExportExpense, members: ExportMember[]): string {
  if (exp.splits.length === 0) return '<span class="muted">—</span>';
  const isAllEqual =
    exp.splits.length === members.length &&
    exp.splits.every((s) => s.amount === exp.splits[0]!.amount);
  if (isAllEqual) {
    return `Chia đều cho cả nhóm (${exp.splits.length} người)`;
  }
  const parts = exp.splits.map(
    (s) => `${memberLabel(s.memberId, members)}: <b>${formatVND(s.amount)}</b>`,
  );
  return parts.join(' · ');
}

/** Section: bảng các khoản chi. Nếu highlightMemberId truyền vào, dòng liên quan tô màu nhẹ. */
function renderExpensesTable(
  expenses: ExportExpense[],
  members: ExportMember[],
  highlightMemberId?: string | null,
): string {
  if (expenses.length === 0) {
    return '<p class="muted">Chưa có khoản chi nào.</p>';
  }
  const rows = expenses
    .map((exp) => {
      const isRelated =
        !!highlightMemberId &&
        (exp.paidBy === highlightMemberId ||
          exp.splits.some((s) => s.memberId === highlightMemberId));
      const cls = isRelated ? 'row-related' : '';
      const noteHtml = exp.note
        ? `<div class="note">${escapeHtml(exp.note)}</div>`
        : '';
      return `
        <tr class="${cls}">
          <td class="col-date">${formatDate(exp.date)}</td>
          <td class="col-title">
            <div class="title">${escapeHtml(exp.title)}</div>
            ${noteHtml}
          </td>
          <td class="col-amount">${formatVND(exp.amount)}</td>
          <td class="col-payer">${memberLabel(exp.paidBy, members)}</td>
          <td class="col-splits">${renderSplitsCell(exp, members)}</td>
        </tr>`;
    })
    .join('');
  return `
    <table class="data">
      <thead>
        <tr>
          <th class="col-date">Ngày</th>
          <th class="col-title">Khoản chi</th>
          <th class="col-amount">Số tiền</th>
          <th class="col-payer">Người trả</th>
          <th class="col-splits">Chia cho</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPaymentsTable(
  payments: ExportPayment[],
  members: ExportMember[],
): string {
  if (payments.length === 0) {
    return '<p class="muted">Chưa có thanh toán nào được ghi nhận.</p>';
  }
  const rows = payments
    .map((p) => {
      const noteHtml = p.note ? `<div class="note">${escapeHtml(p.note)}</div>` : '';
      return `
        <tr>
          <td class="col-date">${formatDate(p.date)}</td>
          <td>${memberLabel(p.fromMemberId, members)}</td>
          <td class="arrow">→</td>
          <td>${memberLabel(p.toMemberId, members)}</td>
          <td class="col-amount">${formatVND(p.amount)}</td>
          <td>${noteHtml}</td>
        </tr>`;
    })
    .join('');
  return `
    <table class="data">
      <thead>
        <tr>
          <th class="col-date">Ngày</th>
          <th>Người trả</th>
          <th></th>
          <th>Người nhận</th>
          <th class="col-amount">Số tiền</th>
          <th>Ghi chú</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function toneOf(balance: number): 'pos' | 'neg' | 'zero' {
  if (balance > 0) return 'pos';
  if (balance < 0) return 'neg';
  return 'zero';
}

function balanceLabel(balance: number): string {
  if (balance > 0) return 'được nợ';
  if (balance < 0) return 'đang nợ';
  return 'cân bằng';
}

function renderBalancesTable(
  balances: ExportBalance[],
  status: 'open' | 'closed',
): string {
  if (balances.length === 0) {
    return '<p class="muted">Chưa có dữ liệu số dư.</p>';
  }
  const hasOutstanding = balances.some((b) => b.balance !== 0);
  const warning =
    status === 'closed' && hasOutstanding
      ? '<div class="warning-banner">⚠ Chuyến đi đã hoàn thành nhưng vẫn còn số dư chưa quyết toán. Số liệu dưới đây phản ánh tại thời điểm đóng chuyến.</div>'
      : '';
  const rows = balances
    .map((b) => {
      const tone = toneOf(b.balance);
      const label = balanceLabel(b.balance);
      return `
        <tr>
          <td>${escapeHtml(b.memberName)}</td>
          <td class="col-amount ${tone}">${formatVND(Math.abs(b.balance))}</td>
          <td class="meta">${label}</td>
        </tr>`;
    })
    .join('');
  return `${warning}
    <table class="data">
      <thead>
        <tr>
          <th>Thành viên</th>
          <th class="col-amount">Số dư</th>
          <th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSettlementsTable(
  settlements: ExportSettlement[],
  status: 'open' | 'closed',
): string {
  if (settlements.length === 0) {
    const msg =
      status === 'closed'
        ? 'Đã quyết toán xong.'
        : 'Cả nhóm đã cân bằng — không cần thanh toán thêm.';
    return `<p class="muted">${msg}</p>`;
  }
  const rows = settlements
    .map(
      (s) => `
        <tr>
          <td>${escapeHtml(s.fromName)}</td>
          <td class="arrow">→</td>
          <td>${escapeHtml(s.toName)}</td>
          <td class="col-amount">${formatVND(s.amount)}</td>
        </tr>`,
    )
    .join('');
  return `
    <table class="data">
      <thead>
        <tr>
          <th>Người trả</th>
          <th></th>
          <th>Người nhận</th>
          <th class="col-amount">Số tiền</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function settlementSectionHeading(
  status: 'open' | 'closed',
  hasSettlements: boolean,
): string {
  if (status === 'closed' && hasSettlements) return 'Số nợ chưa quyết toán';
  return 'Gợi ý quyết toán';
}

/** Card kết luận net cho mode per-person. */
function renderPersonSummaryCard(
  memberName: string,
  totalBalance: number,
): string {
  const tone = toneOf(totalBalance);
  const safeName = escapeHtml(memberName);
  let label: string;
  if (totalBalance > 0) label = `${safeName} được nợ`;
  else if (totalBalance < 0) label = `${safeName} đang nợ`;
  else label = `${safeName} đã cân bằng`;
  return `
    <div class="summary-card">
      <div class="summary-label">${label}</div>
      <div class="summary-amount ${tone}">${formatVND(Math.abs(totalBalance))}</div>
    </div>`;
}

/** Diễn giải từng dòng cho 1 thành viên (chỉ liên quan họ). */
function renderExplanationLines(
  lines: ExplanationLine[],
  memberName: string,
): string {
  if (lines.length === 0) {
    return `<p class="muted">${escapeHtml(memberName)} chưa liên quan đến khoản chi hay thanh toán nào trong chuyến đi này.</p>`;
  }
  const rows = lines
    .map((line) => {
      const deltaTone = line.delta >= 0 ? 'pos' : 'neg';
      const deltaSign = line.delta >= 0 ? '+' : '−';
      const deltaText = `${deltaSign}${formatVND(Math.abs(line.delta))}`;
      const title = renderExplanationTitle(line, memberName);
      const detail = renderExplanationDetail(line, memberName);
      const dateStr = line.date ? formatDate(line.date) : '';
      return `
        <tr>
          <td class="col-date">${escapeHtml(dateStr)}</td>
          <td>
            <div class="title">${title}</div>
            <div class="meta">${detail}</div>
          </td>
          <td class="col-amount ${deltaTone}">${deltaText}</td>
        </tr>`;
    })
    .join('');
  return `
    <table class="data">
      <thead>
        <tr>
          <th class="col-date">Ngày</th>
          <th>Diễn giải</th>
          <th class="col-amount">Ảnh hưởng</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderExplanationTitle(line: ExplanationLine, memberName: string): string {
  const me = escapeHtml(memberName);
  const other = escapeHtml(line.counterpartName ?? '?');
  switch (line.kind) {
    case 'payment_sent':
      return `${me} đã thanh toán cho ${other}`;
    case 'payment_received':
      return `${other} đã thanh toán cho ${me}`;
    default:
      return escapeHtml(line.title);
  }
}

function renderExplanationDetail(line: ExplanationLine, memberName: string): string {
  const me = escapeHtml(memberName);
  const other = escapeHtml(line.counterpartName ?? '?');
  switch (line.kind) {
    case 'expense_paid_only':
      return `${me} trả <b>${formatVND(line.amount)}</b> · không chịu phần nào`;
    case 'expense_paid_and_split':
      return `${me} trả <b>${formatVND(line.amount)}</b> · phần ${me} chịu <b>${formatVND(line.myShare ?? 0)}</b>`;
    case 'expense_split_only':
      return `${other} trả <b>${formatVND(line.amount)}</b> · phần ${me} chịu <b>${formatVND(line.myShare ?? 0)}</b>`;
    case 'payment_sent':
      return `Giảm số ${me} còn nợ ${other}`;
    case 'payment_received':
      return `Giảm số ${other} còn nợ ${me}`;
  }
}

const BASE_STYLES = `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm 12mm; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    line-height: 1.45;
  }
  h1 {
    font-size: 20pt;
    margin: 0 0 4px 0;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  h2 {
    font-size: 13pt;
    margin: 22px 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e5e5;
    font-weight: 600;
  }
  .header {
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .header .sub {
    font-size: 10pt;
    color: #666;
    margin-top: 4px;
  }
  .header .meta-row {
    display: flex;
    gap: 18px;
    margin-top: 8px;
    font-size: 9.5pt;
    color: #555;
  }
  .stats {
    display: flex;
    gap: 18px;
    margin: 12px 0 4px 0;
    padding: 12px 14px;
    background: #f6f7f8;
    border-radius: 8px;
  }
  .stats .stat {
    flex: 1;
  }
  .stats .stat-label {
    font-size: 9pt;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .stats .stat-value {
    font-size: 14pt;
    font-weight: 600;
    margin-top: 2px;
  }
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
    font-size: 10pt;
  }
  table.data th, table.data td {
    text-align: left;
    padding: 8px 8px;
    border-bottom: 1px solid #ececec;
    vertical-align: top;
  }
  table.data thead th {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #555;
    background: #fafafa;
    font-weight: 600;
    border-bottom: 1.5px solid #d4d4d4;
  }
  table.data .col-date { width: 78px; white-space: nowrap; color: #555; }
  table.data .col-amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
  table.data .col-payer { white-space: nowrap; }
  table.data .col-title .title { font-weight: 600; }
  table.data .col-title .meta { font-size: 9pt; color: #777; margin-top: 1px; }
  table.data .col-title .note { font-size: 9pt; color: #555; margin-top: 3px; font-style: italic; }
  table.data .arrow { text-align: center; color: #888; width: 22px; }
  table.data .row-related { background: #fff8e6; }
  .muted { color: #888; font-size: 10pt; }
  .pos { color: #0a8a3a; }
  .neg { color: #c43030; }
  .zero { color: #555; }
  .summary-card {
    margin: 16px 0 4px 0;
    padding: 16px 18px;
    background: #f6f7f8;
    border-left: 4px solid #1a1a1a;
    border-radius: 6px;
  }
  .summary-card .summary-label {
    font-size: 10.5pt;
    color: #555;
  }
  .summary-card .summary-amount {
    font-size: 22pt;
    font-weight: 700;
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #ececec;
    font-size: 9pt;
    color: #888;
    text-align: center;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 9.5pt;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  .status-badge.open {
    background: #e6f4ea;
    color: #0a8a3a;
    border: 1px solid #b7e0c4;
  }
  .status-badge.closed {
    background: #eef0f7;
    color: #3b3f5c;
    border: 1px solid #c8cde0;
  }
  .warning-banner {
    margin: 10px 0;
    padding: 10px 14px;
    background: #fff8e1;
    border-left: 4px solid #d49a00;
    border-radius: 6px;
    font-size: 10pt;
    color: #6b4d00;
  }
`;

function renderHeader(
  title: string,
  sub: string,
  generatedAt: string,
  status: 'open' | 'closed',
  closedAt: string | null,
): string {
  const badge =
    status === 'closed'
      ? `<span class="status-badge closed">✓ Đã hoàn thành${closedAt ? ` ngày ${escapeHtml(formatDate(closedAt))}` : ''}</span>`
      : `<span class="status-badge open">● Đang mở</span>`;
  return `
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">${escapeHtml(sub)}</div>
      <div class="meta-row">
        <span>Ngày xuất: ${escapeHtml(formatDateTime(generatedAt))}</span>
        ${badge}
      </div>
    </div>`;
}

function renderFooter(): string {
  return `<div class="footer">Tạo bởi Fair Pay — Chia tiền · Không chia rẽ</div>`;
}

function wrapHtml(bodyHtml: string, docTitle: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/** Build PDF HTML cho mode "Cả nhóm". */
export function buildTripGroupHtml(data: TripExportData): string {
  const totalExpenses = data.expenses.reduce((sum, e) => sum + e.amount, 0);
  const stats = `
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Tổng chi</div>
        <div class="stat-value">${formatVND(totalExpenses)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Khoản chi</div>
        <div class="stat-value">${data.expenses.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Thanh toán</div>
        <div class="stat-value">${data.payments.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Thành viên</div>
        <div class="stat-value">${data.members.length}</div>
      </div>
    </div>`;

  const settlementHeading = settlementSectionHeading(
    data.status,
    data.settlements.length > 0,
  );
  const body = `
    ${renderHeader(data.tripName, `Nhóm: ${data.groupName}`, data.generatedAt, data.status, data.closedAt)}
    ${stats}
    <h2>Các khoản chi</h2>
    ${renderExpensesTable(data.expenses, data.members)}
    <h2>Thanh toán đã ghi nhận</h2>
    ${renderPaymentsTable(data.payments, data.members)}
    <h2>Số dư cuối kỳ</h2>
    ${renderBalancesTable(data.balances, data.status)}
    <h2>${settlementHeading}</h2>
    ${renderSettlementsTable(data.settlements, data.status)}
    ${renderFooter()}`;

  return wrapHtml(body, `${data.tripName} — Diễn giải nhóm`);
}

/** Build PDF HTML cho mode "Diễn giải cho 1 thành viên". */
export function buildTripPersonHtml(
  data: TripExportData,
  memberId: string,
): string {
  const member = data.members.find((m) => m.id === memberId);
  const memberName = member?.displayName ?? '?';

  const explanation = explainMyTripBalance(
    memberId,
    data.members.map((m) => ({ id: m.id, displayName: m.displayName })),
    data.expenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      paidBy: e.paidBy,
      date: e.date,
      splits: e.splits,
    })),
    data.payments.map((p) => ({
      id: p.id,
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      amount: p.amount,
      date: p.date,
    })),
  );

  const body = `
    ${renderHeader(
      data.tripName,
      `Diễn giải cho ${memberName} · Nhóm: ${data.groupName}`,
      data.generatedAt,
      data.status,
      data.closedAt,
    )}
    ${renderPersonSummaryCard(memberName, explanation.totalBalance)}
    <h2>Diễn giải chi tiết (liên quan ${escapeHtml(memberName)})</h2>
    ${renderExplanationLines(explanation.lines, memberName)}
    <h2>Toàn bộ khoản chi của chuyến đi</h2>
    <p class="muted">Các dòng tô vàng là khoản chi mà ${escapeHtml(memberName)} có liên quan (trả hoặc chịu một phần).</p>
    ${renderExpensesTable(data.expenses, data.members, memberId)}
    <h2>Thanh toán đã ghi nhận</h2>
    ${renderPaymentsTable(data.payments, data.members)}
    ${renderFooter()}`;

  return wrapHtml(body, `${data.tripName} — Diễn giải cho ${memberName}`);
}
