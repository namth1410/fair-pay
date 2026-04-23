// Convert #RRGGBB hoặc #RGB → [r, g, b] float (0-1) cho Skia SkSL uniform vec3.
// Fallback xám trung tính nếu input không hợp lệ — tránh crash runtime.
const FALLBACK: [number, number, number] = [0.5, 0.5, 0.5];

export function hexToRgb(hex: string | undefined | null): [number, number, number] {
  if (typeof hex !== 'string' || hex.length === 0) return FALLBACK;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return FALLBACK;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return FALLBACK;
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return [r, g, b];
}
