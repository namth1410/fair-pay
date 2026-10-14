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

export interface PastelColor {
  bg: string;
  fg: string;
}

// Pastel đặc (không gradient) cho avatar kiểu app nhắn tin — mỗi nhóm/người 1 màu dễ phân biệt.
// Cặp bg/fg đều tương phản ≥ 7:1. Thứ tự 2 bảng phải khớp nhau để 1 seed giữ cùng "màu" ở 2 theme.
const PASTEL_LIGHT: PastelColor[] = [
  { bg: '#CDEFD8', fg: '#14532D' }, // bạc hà
  { bg: '#FFE9A8', fg: '#6B4E00' }, // vàng bơ
  { bg: '#DCE9FF', fg: '#1D3F7A' }, // xanh trời
  { bg: '#FFDCD2', fg: '#7A1E14' }, // đào
  { bg: '#EFE6FF', fg: '#4A2B8A' }, // tím nhạt
  { bg: '#D7F2F0', fg: '#0F4F4A' }, // xanh ngọc
];
const PASTEL_DARK: PastelColor[] = [
  { bg: '#1E3B2A', fg: '#9FE0B5' },
  { bg: '#3A3216', fg: '#F2D675' },
  { bg: '#1C2B44', fg: '#A9C8FF' },
  { bg: '#3D211C', fg: '#FFB4A6' },
  { bg: '#2C2342', fg: '#CDB8FF' },
  { bg: '#163533', fg: '#8EDBD3' },
];

export function pickPastel(seed: string, isDark: boolean): PastelColor {
  const list = isDark ? PASTEL_DARK : PASTEL_LIGHT;
  return list[hashSeed(seed) % list.length] as PastelColor;
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
