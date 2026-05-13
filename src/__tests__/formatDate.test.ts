import { formatDateSection, formatDateTimeVN, formatDateVN } from '../utils/format';

// Helper: tạo Date tại VN timezone (+07:00). Test deterministic không phụ thuộc TZ máy chạy.
function vn(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe('formatDateVN', () => {
  it('formats with leading zeros for day and month', () => {
    expect(formatDateVN(vn('2026-01-05T10:00:00'))).toBe('05/01/2026');
    expect(formatDateVN(vn('2026-12-09T10:00:00'))).toBe('09/12/2026');
  });

  it('formats standard date', () => {
    expect(formatDateVN(vn('2026-05-13T15:30:00'))).toBe('13/05/2026');
  });
});

describe('formatDateTimeVN', () => {
  it('formats date and time with 24h clock', () => {
    expect(formatDateTimeVN(vn('2026-05-13T08:30:00'))).toBe('13/05/2026 08:30');
    expect(formatDateTimeVN(vn('2026-05-13T23:05:00'))).toBe('13/05/2026 23:05');
  });

  it('formats midnight as 00:00', () => {
    expect(formatDateTimeVN(vn('2026-05-13T00:00:00'))).toBe('13/05/2026 00:00');
  });
});

describe('formatDateSection', () => {
  const now = vn('2026-05-13T15:30:00');

  it('returns "Hôm nay" for same VN day', () => {
    expect(formatDateSection(vn('2026-05-13T00:01:00'), now)).toBe('Hôm nay');
    expect(formatDateSection(vn('2026-05-13T23:59:00'), now)).toBe('Hôm nay');
  });

  it('returns "Hôm qua" for previous VN day', () => {
    expect(formatDateSection(vn('2026-05-12T10:00:00'), now)).toBe('Hôm qua');
    expect(formatDateSection(vn('2026-05-12T23:59:00'), now)).toBe('Hôm qua');
  });

  it('returns formatted date for 2+ days ago', () => {
    expect(formatDateSection(vn('2026-05-11T10:00:00'), now)).toBe('11/05/2026');
    expect(formatDateSection(vn('2026-01-05T10:00:00'), now)).toBe('05/01/2026');
  });

  it('handles midnight boundary correctly', () => {
    // 23:59 hôm qua vs 00:01 hôm nay → 2 categories khác
    expect(formatDateSection(vn('2026-05-12T23:59:00'), now)).toBe('Hôm qua');
    expect(formatDateSection(vn('2026-05-13T00:01:00'), now)).toBe('Hôm nay');
  });

  it('uses now=new Date() by default', () => {
    // Smoke test: gọi không truyền now không throw
    expect(() => formatDateSection(new Date())).not.toThrow();
  });
});
