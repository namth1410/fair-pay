import {
  generatePlaceholderInviteCode,
  isPendingInviteCode,
} from '../utils/inviteCode';

describe('generatePlaceholderInviteCode', () => {
  it('starts with PEND- prefix', () => {
    const code = generatePlaceholderInviteCode();
    expect(code.startsWith('PEND-')).toBe(true);
  });

  it('has 4 hex chars uppercase after prefix', () => {
    for (let i = 0; i < 20; i++) {
      const code = generatePlaceholderInviteCode();
      expect(code).toMatch(/^PEND-[0-9A-F]{4}$/);
    }
  });

  it('produces non-deterministic values across calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generatePlaceholderInviteCode());
    // Với 50 lần và pool 65k khả năng, kỳ vọng > 45 unique (xác suất birthday).
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('isPendingInviteCode', () => {
  it('returns true for placeholder', () => {
    expect(isPendingInviteCode('PEND-A3F2')).toBe(true);
    expect(isPendingInviteCode(generatePlaceholderInviteCode())).toBe(true);
  });

  it('returns false for real 6-char server codes', () => {
    expect(isPendingInviteCode('ABC123')).toBe(false);
    expect(isPendingInviteCode('xyz789')).toBe(false);
    expect(isPendingInviteCode('K8R3M2')).toBe(false);
  });

  it('returns false for nullish input', () => {
    expect(isPendingInviteCode(null)).toBe(false);
    expect(isPendingInviteCode(undefined)).toBe(false);
    expect(isPendingInviteCode('')).toBe(false);
  });

  it('returns false for prefix lookalikes', () => {
    expect(isPendingInviteCode('PEN-AAAA')).toBe(false);
    expect(isPendingInviteCode('pend-AAAA')).toBe(false); // case-sensitive
    expect(isPendingInviteCode('XPEND-AA')).toBe(false);
  });
});
