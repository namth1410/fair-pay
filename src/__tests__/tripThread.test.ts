/**
 * Tests cho buildTripThread / formatThreadDay — luồng tin của màn chuyến đi (inverted list).
 */
import { buildTripThread, formatThreadDay } from '../utils/tripThread';

// 2026-10-14 10:00 giờ VN (Thứ Tư)
const NOW = new Date('2026-10-14T03:00:00Z');

const exp = (id: string, date: string, created_at = date) => ({ id, date, created_at });
const pay = (id: string, date: string, created_at = date) => ({ id, date, created_at });

describe('formatThreadDay', () => {
  it('Hôm nay / Hôm qua theo giờ VN', () => {
    expect(formatThreadDay(new Date('2026-10-14T01:00:00Z'), NOW)).toBe('Hôm nay');
    expect(formatThreadDay(new Date('2026-10-13T12:00:00Z'), NOW)).toBe('Hôm qua');
  });

  it('ngày khác: thứ + dd/mm (cùng năm)', () => {
    expect(formatThreadDay(new Date('2026-10-11T05:00:00Z'), NOW)).toBe('Chủ Nhật, 11/10');
    expect(formatThreadDay(new Date('2026-10-10T05:00:00Z'), NOW)).toBe('Thứ Bảy, 10/10');
  });

  it('khác năm thì thêm năm', () => {
    expect(formatThreadDay(new Date('2025-12-31T05:00:00Z'), NOW)).toBe('Thứ Tư, 31/12/2025');
  });

  it('17h UTC đã sang ngày hôm sau ở VN', () => {
    // 2026-10-10T17:30Z = 00:30 ngày 11/10 giờ VN
    expect(formatThreadDay(new Date('2026-10-10T17:30:00Z'), NOW)).toBe('Chủ Nhật, 11/10');
  });
});

describe('buildTripThread', () => {
  it('rỗng → rỗng (không thẻ gợi ý khi không yêu cầu)', () => {
    expect(buildTripThread({ expenses: [], payments: [], now: NOW })).toEqual([]);
  });

  it('mới nhất trước, vạch ngày đứng sau tin của ngày đó trong mảng', () => {
    const items = buildTripThread({
      expenses: [
        exp('e1', '2026-10-10T02:00:00Z'),
        exp('e2', '2026-10-11T03:00:00Z'),
      ],
      payments: [pay('p1', '2026-10-11T08:00:00Z')],
      now: NOW,
    });
    expect(items.map((i) => i.key)).toEqual([
      'p-p1',
      'e-e2',
      'day-2026-10-11',
      'e-e1',
      'day-2026-10-10',
    ]);
  });

  it('cùng ngày & cùng date thì xếp theo created_at', () => {
    const items = buildTripThread({
      expenses: [
        exp('late', '2026-10-11', '2026-10-11T09:00:00Z'),
        exp('early', '2026-10-11', '2026-10-11T01:00:00Z'),
      ],
      payments: [],
      now: NOW,
    });
    expect(items.map((i) => i.key)).toEqual(['e-late', 'e-early', 'day-2026-10-11']);
  });

  it('chuyến đã đóng → tin hệ thống ở đầu mảng (đáy luồng), bỏ thẻ gợi ý', () => {
    const items = buildTripThread({
      expenses: [exp('e1', '2026-10-10T02:00:00Z')],
      payments: [],
      closedAt: '2026-10-13T14:00:00Z',
      showSuggest: true,
      now: NOW,
    });
    expect(items[0]).toEqual({ kind: 'closed', key: 'closed', closedAt: '2026-10-13T14:00:00Z' });
    expect(items.some((i) => i.kind === 'suggest')).toBe(false);
  });

  it('chuyến mở + có gợi ý → thẻ gợi ý ở đầu mảng', () => {
    const items = buildTripThread({
      expenses: [exp('e1', '2026-10-10T02:00:00Z')],
      payments: [],
      showSuggest: true,
      now: NOW,
    });
    expect(items[0]?.kind).toBe('suggest');
  });

  it('date không parse được vẫn không crash (xếp đầu luồng)', () => {
    const items = buildTripThread({
      expenses: [exp('bad', 'not-a-date', 'also-bad'), exp('ok', '2026-10-11T03:00:00Z')],
      payments: [],
      now: NOW,
    });
    expect(items.filter((i) => i.kind === 'expense')).toHaveLength(2);
  });
});
