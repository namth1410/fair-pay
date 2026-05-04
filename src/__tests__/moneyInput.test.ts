import {
  computeMoneySuggestions,
  DEFAULT_MONEY_SUGGESTIONS,
  formatThousands,
  parseMoneyInput,
} from '../utils/format';

const DEFAULT_SUGGESTIONS = DEFAULT_MONEY_SUGGESTIONS;

describe('formatThousands', () => {
  it('returns empty string for empty input', () => {
    expect(formatThousands('')).toBe('');
    expect(formatThousands(0)).toBe('0');
  });

  it('formats thousands with dot separator', () => {
    expect(formatThousands(150_000)).toBe('150.000');
    expect(formatThousands(1_500_000)).toBe('1.500.000');
    expect(formatThousands(1_000_000_000)).toBe('1.000.000.000');
  });

  it('handles short numbers without separator', () => {
    expect(formatThousands(1)).toBe('1');
    expect(formatThousands(99)).toBe('99');
    expect(formatThousands(999)).toBe('999');
  });

  it('strips non-digits when given a string', () => {
    expect(formatThousands('1.500.000')).toBe('1.500.000');
    expect(formatThousands('150abc000')).toBe('150.000');
  });
});

describe('parseMoneyInput', () => {
  it('strips non-digit characters', () => {
    expect(parseMoneyInput('1.500.000')).toBe('1500000');
    expect(parseMoneyInput('150abc000')).toBe('150000');
    expect(parseMoneyInput('1.500.000đ')).toBe('1500000');
    expect(parseMoneyInput('  150 000 ')).toBe('150000');
  });

  it('returns empty string for empty / non-digit input', () => {
    expect(parseMoneyInput('')).toBe('');
    expect(parseMoneyInput('abc')).toBe('');
  });
});

describe('computeMoneySuggestions', () => {
  it('returns defaults when input is empty', () => {
    expect(computeMoneySuggestions('')).toEqual(DEFAULT_SUGGESTIONS);
  });

  it('returns defaults when input is zero', () => {
    expect(computeMoneySuggestions('0')).toEqual(DEFAULT_SUGGESTIONS);
    expect(computeMoneySuggestions('00')).toEqual(DEFAULT_SUGGESTIONS);
  });

  it('returns 4 multiplied suggestions for "1"', () => {
    expect(computeMoneySuggestions('1')).toEqual([
      10_000,
      100_000,
      1_000_000,
      10_000_000,
    ]);
  });

  it('returns 4 multiplied suggestions for "12"', () => {
    expect(computeMoneySuggestions('12')).toEqual([
      120_000,
      1_200_000,
      12_000_000,
      120_000_000,
    ]);
  });

  it('returns 4 multiplied suggestions for "150"', () => {
    expect(computeMoneySuggestions('150')).toEqual([
      1_500_000,
      15_000_000,
      150_000_000,
      1_500_000_000,
    ]);
  });

  it('caps suggestions exceeding ~999 tỷ', () => {
    // 5000 × 10000 = 50M, ×100k = 500M, ×1M = 5B, ×10M = 50B (still under 999B)
    // 99_999 × 10000 = 999.99M, ×100k = ~10B, ×1M = ~100B, ×10M = ~999.99B (just under MAX)
    const result = computeMoneySuggestions('99999');
    expect(result.every((v) => v <= 999_999_999_000)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('truncates list when very large numbers exceed cap', () => {
    // 999_999 × 10M = ~10 nghìn tỷ → exceeds cap → that mult dropped
    const result = computeMoneySuggestions('999999');
    expect(result.length).toBeLessThan(4);
    expect(result.every((v) => v <= 999_999_999_000)).toBe(true);
  });

  it('every suggestion is a multiple of 1000 (passes validateAmount)', () => {
    for (const typed of ['1', '12', '150', '999', '5000']) {
      const result = computeMoneySuggestions(typed);
      for (const v of result) {
        expect(v % 1000).toBe(0);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('uses caller-provided defaults for empty state', () => {
    const customDefaults = [10_000, 20_000];
    expect(computeMoneySuggestions('', customDefaults)).toEqual(customDefaults);
  });
});
