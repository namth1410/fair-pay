// FNV-1a 32-bit hash — đủ tốt để map seed → màu, không lo collision ở app scale.
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SeedGradient {
  from: string;
  to: string;
  text: string;
}

// Grayscale gradient — vary lightness, saturation = 0. Dùng cho Avatar nhỏ
// (initials trên nền trung tính, không cạnh tranh với content xung quanh).
//
// Dùng unsigned shift `>>>` để hash nhánh cao (MSB bật) không lật về số âm
// (signed shift `>>` sẽ làm modulo trả số âm, lệch dải).
export function pickGradient(seed: string): SeedGradient {
  const h = hashSeed(seed);
  const lightness1 = 78 + ((h >>> 8) % 12);
  const lightness2 = 64 + ((h >>> 16) % 12);

  return {
    from: `hsl(0, 0%, ${lightness1}%)`,
    to: `hsl(0, 0%, ${lightness2}%)`,
    text: 'hsl(0, 0%, 18%)',
  };
}

export interface HeroGradient {
  from: string;
  to: string;
  /** Solid pick từ cùng hue — dùng làm fallback dominant color cho info section. */
  accent: string;
  text: string;
}

// Saturated variant cho hero fallback ở card carousel — hue lấy từ hash, S/L
// nằm trong dải dễ chịu (không quá rực, không quá xám), text fix dark cho
// contrast trên cả 2 stop.
export function pickHeroGradient(seed: string): HeroGradient {
  const h = hashSeed(seed);
  const hue = h % 360;
  const sat1 = 38 + ((h >>> 8) % 12); // 38-49%
  const sat2 = 30 + ((h >>> 16) % 12); // 30-41%
  const light1 = 72 + ((h >>> 12) % 8); // 72-79%
  const light2 = 60 + ((h >>> 20) % 8); // 60-67%
  const accentL = 64 + ((h >>> 4) % 6); // 64-69% — dùng cho info section khi không có ảnh

  return {
    from: `hsl(${hue}, ${sat1}%, ${light1}%)`,
    to: `hsl(${hue}, ${sat2}%, ${light2}%)`,
    accent: `hsl(${hue}, ${sat1}%, ${accentL}%)`,
    text: 'hsl(0, 0%, 18%)',
  };
}

export function getInitials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
