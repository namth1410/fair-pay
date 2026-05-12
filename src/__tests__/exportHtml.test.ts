import {
  buildTripGroupHtml,
  buildTripPersonHtml,
  escapeHtml,
  type TripExportData,
} from '../utils/exportHtml';

describe('escapeHtml', () => {
  it('escapes 5 HTML special characters', () => {
    expect(escapeHtml('<b>Hi</b>')).toBe('&lt;b&gt;Hi&lt;/b&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"q\'')).toBe('&quot;q&#39;');
  });

  it('neutralizes script injection', () => {
    const evil = '<script>alert(1)</script>';
    const safe = escapeHtml(evil);
    expect(safe).not.toContain('<script>');
    expect(safe).toContain('&lt;script&gt;');
  });

  it('leaves clean Vietnamese text untouched', () => {
    expect(escapeHtml('Ăn tối ở Hà Nội')).toBe('Ăn tối ở Hà Nội');
  });
});

const SAMPLE_DATA: TripExportData = {
  tripName: 'Đà Lạt tháng 4',
  groupName: 'Nhóm bạn cấp 3',
  generatedAt: '2026-05-11T10:30:00.000Z',
  status: 'open',
  closedAt: null,
  members: [
    { id: 'A', displayName: 'An', isVirtual: false },
    { id: 'B', displayName: 'Bình', isVirtual: false },
    { id: 'C', displayName: 'Chi (ảo)', isVirtual: true },
  ],
  expenses: [
    {
      id: 'e1',
      title: 'Ăn tối',
      amount: 300_000,
      paidBy: 'A',
      date: '2026-04-20',
      note: null,
      splits: [
        { memberId: 'A', amount: 100_000 },
        { memberId: 'B', amount: 100_000 },
        { memberId: 'C', amount: 100_000 },
      ],
    },
    {
      id: 'e2',
      title: 'Taxi',
      amount: 240_000,
      paidBy: 'B',
      date: '2026-04-21',
      note: 'Đi sân bay',
      splits: [
        { memberId: 'A', amount: 120_000 },
        { memberId: 'C', amount: 120_000 },
      ],
    },
  ],
  payments: [
    {
      id: 'p1',
      fromMemberId: 'A',
      toMemberId: 'B',
      amount: 50_000,
      date: '2026-04-22',
      note: null,
    },
  ],
  balances: [
    { memberId: 'A', memberName: 'An', balance: 130_000 },
    { memberId: 'B', memberName: 'Bình', balance: 90_000 },
    { memberId: 'C', memberName: 'Chi (ảo)', balance: -220_000 },
  ],
  settlements: [
    { from: 'C', fromName: 'Chi (ảo)', to: 'A', toName: 'An', amount: 130_000 },
    { from: 'C', fromName: 'Chi (ảo)', to: 'B', toName: 'Bình', amount: 90_000 },
  ],
};

describe('buildTripGroupHtml', () => {
  const html = buildTripGroupHtml(SAMPLE_DATA);

  it('returns a complete HTML document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain('</html>');
  });

  it('includes trip name, group name, and generated time in the header', () => {
    expect(html).toContain('Đà Lạt tháng 4');
    expect(html).toContain('Nhóm bạn cấp 3');
    expect(html).toContain('Ngày xuất:');
  });

  it('lists every expense with payer and amount', () => {
    expect(html).toContain('Ăn tối');
    expect(html).toContain('Taxi');
    expect(html).toContain('300.000đ');
    expect(html).toContain('240.000đ');
  });

  it('shows expense notes when present', () => {
    expect(html).toContain('Đi sân bay');
  });

  it('does NOT mark virtual members in PDF (recipient should not distinguish)', () => {
    // Sample member name happens to contain "(ảo)" as part of displayName, that's fine.
    // What we forbid is the synthetic <span class="ghost">(ảo)</span> badge.
    expect(html).not.toContain('class="ghost"');
  });

  it('includes balances table with positive/negative tone classes', () => {
    expect(html).toContain('Số dư cuối kỳ');
    expect(html).toContain('class="col-amount pos"');
    expect(html).toContain('class="col-amount neg"');
  });

  it('includes settlement suggestions', () => {
    expect(html).toContain('Gợi ý quyết toán');
    expect(html).toContain('130.000đ');
  });

  it('shows recorded payments section', () => {
    expect(html).toContain('Thanh toán đã ghi nhận');
    expect(html).toContain('50.000đ');
  });
});

describe('buildTripPersonHtml', () => {
  const html = buildTripPersonHtml(SAMPLE_DATA, 'A');

  it('returns a complete HTML document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('addresses the chosen member by name in the header', () => {
    expect(html).toContain('Diễn giải cho An');
  });

  it('shows the net balance as a summary card', () => {
    // An's net = +130.000đ (positive → "được nợ")
    expect(html).toContain('An được nợ');
    expect(html).toContain('130.000đ');
  });

  it('renders the explanation section for the chosen member', () => {
    expect(html).toContain('Diễn giải chi tiết (liên quan An)');
    // Should mention the counterparts in detail lines
    expect(html).toContain('An trả');
    expect(html).toContain('Bình trả');
  });

  it('renders signed deltas in the explanation table', () => {
    // Ăn tối: An trả 300k, chịu 100k → +200k delta
    expect(html).toMatch(/[+]200\.000đ/);
    // Taxi: An chịu 120k → -120k delta (minus sign uses Unicode "−")
    expect(html).toMatch(/−120\.000đ/);
  });

  it('includes the full expenses table with highlight class for related rows', () => {
    expect(html).toContain('Toàn bộ khoản chi của chuyến đi');
    expect(html).toContain('row-related');
  });

  it('escapes hostile member names', () => {
    const data: TripExportData = {
      ...SAMPLE_DATA,
      members: [
        ...SAMPLE_DATA.members,
        { id: 'X', displayName: '<img src=x onerror=alert(1)>', isVirtual: false },
      ],
    };
    const out = buildTripPersonHtml(data, 'X');
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x');
  });
});

describe('buildTripGroupHtml — trip status', () => {
  it('shows "Đang mở" badge for open trip', () => {
    const html = buildTripGroupHtml(SAMPLE_DATA);
    expect(html).toContain('status-badge open');
    expect(html).toContain('Đang mở');
  });

  it('shows "Đã hoàn thành" badge with closedAt date for closed trip', () => {
    const closed: TripExportData = {
      ...SAMPLE_DATA,
      status: 'closed',
      closedAt: '2026-04-30T08:00:00.000Z',
    };
    const html = buildTripGroupHtml(closed);
    expect(html).toContain('status-badge closed');
    expect(html).toContain('Đã hoàn thành');
    expect(html).toContain('30/04/2026');
  });

  it('shows warning banner when closed but balances != 0', () => {
    const closed: TripExportData = {
      ...SAMPLE_DATA,
      status: 'closed',
      closedAt: '2026-04-30T08:00:00.000Z',
    };
    const html = buildTripGroupHtml(closed);
    expect(html).toContain('<div class="warning-banner">');
    expect(html).toContain('vẫn còn số dư chưa quyết toán');
  });

  it('uses "Số nợ chưa quyết toán" heading when closed + has settlements', () => {
    const closed: TripExportData = {
      ...SAMPLE_DATA,
      status: 'closed',
      closedAt: '2026-04-30T08:00:00.000Z',
    };
    const html = buildTripGroupHtml(closed);
    expect(html).toContain('Số nợ chưa quyết toán');
    expect(html).not.toContain('<h2>Gợi ý quyết toán</h2>');
  });

  it('shows "Đã quyết toán xong" when closed + zero balances', () => {
    const closedSettled: TripExportData = {
      ...SAMPLE_DATA,
      status: 'closed',
      closedAt: '2026-04-30T08:00:00.000Z',
      balances: SAMPLE_DATA.members.map((m) => ({
        memberId: m.id,
        memberName: m.displayName,
        balance: 0,
      })),
      settlements: [],
    };
    const html = buildTripGroupHtml(closedSettled);
    expect(html).toContain('Đã quyết toán xong');
    expect(html).not.toContain('<div class="warning-banner">');
  });

  it('does NOT show warning banner when trip is open + has outstanding balances', () => {
    const html = buildTripGroupHtml(SAMPLE_DATA);
    expect(html).not.toContain('<div class="warning-banner">');
  });
});

describe('buildTripPersonHtml — trip status', () => {
  it('shows closed badge in per-person PDF too', () => {
    const closed: TripExportData = {
      ...SAMPLE_DATA,
      status: 'closed',
      closedAt: '2026-04-30T08:00:00.000Z',
    };
    const html = buildTripPersonHtml(closed, 'A');
    expect(html).toContain('status-badge closed');
    expect(html).toContain('Đã hoàn thành');
  });
});

describe('buildTripGroupHtml — empty cases', () => {
  const empty: TripExportData = {
    tripName: 'Trip rỗng',
    groupName: 'Nhóm rỗng',
    generatedAt: '2026-05-11T00:00:00.000Z',
    status: 'open',
    closedAt: null,
    members: [],
    expenses: [],
    payments: [],
    balances: [],
    settlements: [],
  };

  it('renders gracefully with no data', () => {
    const html = buildTripGroupHtml(empty);
    expect(html).toContain('Chưa có khoản chi nào.');
    expect(html).toContain('Chưa có thanh toán nào được ghi nhận.');
    expect(html).toContain('Cả nhóm đã cân bằng');
  });
});
