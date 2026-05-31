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

  it('single-digit "1" → full ladder up to cap', () => {
    expect(computeMoneySuggestions('1')).toEqual([
      10_000,
      100_000,
      1_000_000,
      10_000_000,
    ]);
  });

  it('single-digit "3" → drops 30tr above cap', () => {
    expect(computeMoneySuggestions('3')).toEqual([30_000, 300_000, 3_000_000]);
  });

  it('trailing zeros do not change the ladder (8 / 80 / 800 / 8000 / 80000)', () => {
    const expected = [80_000, 800_000, 8_000_000];
    expect(computeMoneySuggestions('8')).toEqual(expected);
    expect(computeMoneySuggestions('80')).toEqual(expected);
    expect(computeMoneySuggestions('800')).toEqual(expected);
    expect(computeMoneySuggestions('8000')).toEqual(expected);
    expect(computeMoneySuggestions('80000')).toEqual(expected);
  });

  it('multi-digit "12" → drops 12tr above cap', () => {
    expect(computeMoneySuggestions('12')).toEqual([12_000, 120_000, 1_200_000]);
  });

  it('multi-digit "35" → 35k smallest, drops 35tr above cap', () => {
    expect(computeMoneySuggestions('35')).toEqual([35_000, 350_000, 3_500_000]);
  });

  it('"150" → 15k smallest (significant digits), drops 15tr above cap', () => {
    expect(computeMoneySuggestions('150')).toEqual([15_000, 150_000, 1_500_000]);
  });

  it('caps suggestions at 10 triệu', () => {
    const result = computeMoneySuggestions('1');
    expect(result.every((v) => v <= 10_000_000)).toBe(true);
    expect(result[result.length - 1]).toBe(10_000_000);
  });

  it('every suggestion is at least 10k (floor)', () => {
    for (const typed of ['1', '8', '35', '150', '999']) {
      for (const v of computeMoneySuggestions(typed)) {
        expect(v).toBeGreaterThanOrEqual(10_000);
      }
    }
  });

  it('exactly 10 triệu literal → single chip at cap', () => {
    expect(computeMoneySuggestions('10000000')).toEqual([10_000_000]);
  });

  it('returns empty list when literal amount already exceeds cap', () => {
    // 20 triệu literal > cap 10tr → không còn gợi ý hợp lệ
    expect(computeMoneySuggestions('20000000')).toEqual([]);
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
