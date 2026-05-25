import { gradientFromString } from '../utils/gradientFromString';

describe('gradientFromString', () => {
  it('là deterministic — same input cho same output', () => {
    const a = gradientFromString('Bún bò Huế', false);
    const b = gradientFromString('Bún bò Huế', false);
    expect(a).toEqual(b);
  });

  it('trả về 3 màu HSL khác nhau', () => {
    const [a, b, c] = gradientFromString('test', false);
    expect(a).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('input khác nhau ra màu khác nhau', () => {
    const a = gradientFromString('Cà phê', false);
    const b = gradientFromString('Phở bò', false);
    expect(a).not.toEqual(b);
  });

  it('dark variant dùng lightness khác light', () => {
    const light = gradientFromString('x', false);
    const dark = gradientFromString('x', true);
    expect(light).not.toEqual(dark);
    // Light lightness 70%, dark lightness 35%
    expect(light[0]).toContain('70%');
    expect(dark[0]).toContain('35%');
  });

  it('handle empty string không crash', () => {
    expect(() => gradientFromString('', false)).not.toThrow();
    const result = gradientFromString('', false);
    expect(result).toHaveLength(3);
  });

  it('handle whitespace-only string', () => {
    expect(() => gradientFromString('   ', false)).not.toThrow();
  });

  it('hue đầu tiên trong [0, 359]', () => {
    for (const title of ['a', 'abc', 'Ăn uống', '🌶️🍜']) {
      const [first] = gradientFromString(title, false);
      const match = first.match(/^hsl\((\d+)/);
      expect(match).not.toBeNull();
      const hue = Number(match![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
