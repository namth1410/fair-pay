/**
 * Tests cho seedGradient util — đảm bảo deterministic theo seed và
 * pickHeroGradient nằm trong dải S/L hợp lệ (không quá rực, không quá xám).
 */
import {
  getInitials,
  hashSeed,
  pickGradient,
  pickHeroGradient,
} from '../utils/seedGradient';

describe('hashSeed', () => {
  it('deterministic — cùng seed trả cùng hash', () => {
    expect(hashSeed('group-1')).toBe(hashSeed('group-1'));
  });

  it('khác seed thường ra khác hash', () => {
    expect(hashSeed('group-1')).not.toBe(hashSeed('group-2'));
  });

  it('luôn trả unsigned 32-bit', () => {
    const h = hashSeed('any seed string here');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('pickGradient (avatar grayscale)', () => {
  it('saturation = 0% (grayscale)', () => {
    const g = pickGradient('seed-x');
    expect(g.from).toMatch(/hsl\(0,\s*0%,\s*\d+%\)/);
    expect(g.to).toMatch(/hsl\(0,\s*0%,\s*\d+%\)/);
  });

  it('text fix dark cho contrast', () => {
    expect(pickGradient('any').text).toBe('hsl(0, 0%, 18%)');
  });
});

function parseHsl(s: string): { h: number; s: number; l: number } {
  const m = /hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/.exec(s);
  if (!m) throw new Error(`bad hsl: ${s}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

describe('pickHeroGradient (carousel hero fallback)', () => {
  // Run qua nhiều seed để cover variation hash bits.
  const seeds = [
    'g-1',
    'group-abc',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'short',
    '',
    '🟢🌟',
  ];

  it.each(seeds)('hue ∈ [0,360), S ∈ [25,55], L from ∈ [70,82], L to ∈ [55,72] với seed=%s', (seed) => {
    const g = pickHeroGradient(seed);
    const f = parseHsl(g.from);
    const t = parseHsl(g.to);
    const a = parseHsl(g.accent);

    expect(f.h).toBeGreaterThanOrEqual(0);
    expect(f.h).toBeLessThan(360);
    expect(f.h).toBe(t.h); // cùng hue
    expect(f.h).toBe(a.h);

    expect(f.s).toBeGreaterThanOrEqual(25);
    expect(f.s).toBeLessThanOrEqual(55);
    expect(t.s).toBeGreaterThanOrEqual(25);
    expect(t.s).toBeLessThanOrEqual(55);

    expect(f.l).toBeGreaterThanOrEqual(70);
    expect(f.l).toBeLessThanOrEqual(82);
    expect(t.l).toBeGreaterThanOrEqual(55);
    expect(t.l).toBeLessThanOrEqual(72);

    expect(a.l).toBeGreaterThanOrEqual(60);
    expect(a.l).toBeLessThanOrEqual(72);
  });

  it('deterministic theo seed', () => {
    expect(pickHeroGradient('foo')).toEqual(pickHeroGradient('foo'));
  });
});

describe('getInitials', () => {
  it('1 từ → 1 ký tự đầu uppercase', () => {
    expect(getInitials('alpha')).toBe('A');
  });

  it('2+ từ → ký tự đầu của từ đầu + từ cuối', () => {
    expect(getInitials('Nhóm Du Lịch')).toBe('NL');
  });

  it('rỗng → "?"', () => {
    expect(getInitials('   ')).toBe('?');
    expect(getInitials('')).toBe('?');
  });
});
