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

  it('single-digit input starts at ×10.000 (e.g. "1")', () => {
    expect(computeMoneySuggestions('1')).toEqual([
      10_000,
      100_000,
      1_000_000,
      10_000_000,
    ]);
  });

  it('single-digit input "3" → 30k as smallest suggestion', () => {
    expect(computeMoneySuggestions('3')).toEqual([
      30_000,
      300_000,
      3_000_000,
      30_000_000,
    ]);
  });

  it('multi-digit input starts at ×1.000 (e.g. "12")', () => {
    expect(computeMoneySuggestions('12')).toEqual([
      12_000,
      120_000,
      1_200_000,
      12_000_000,
    ]);
  });

  it('multi-digit input "35" → 35k as smallest suggestion', () => {
    expect(computeMoneySuggestions('35')).toEqual([
      35_000,
      350_000,
      3_500_000,
      35_000_000,
    ]);
  });

  it('multi-digit input "150" → starts at 150k', () => {
    expect(computeMoneySuggestions('150')).toEqual([
      150_000,
      1_500_000,
      15_000_000,
      150_000_000,
    ]);
  });

  it('caps suggestions exceeding ~999 tỷ', () => {
    const result = computeMoneySuggestions('99999');
    expect(result.every((v) => v <= 999_999_999_000)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('truncates list when very large numbers exceed cap', () => {
    // 10_000_000 × 100k = 1000 tỷ → exceeds cap → that mult and beyond dropped
    const result = computeMoneySuggestions('10000000');
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
