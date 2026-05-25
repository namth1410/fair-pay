// Deterministic gradient generator: same input -> same 3 HSL colors.
// Dùng cho fallback placeholder của expense thumbnail khi không có ảnh.
// FNV-1a 32-bit hash -> base hue; 3 màu cách nhau 50° trên hue wheel.

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function gradientFromString(
  input: string,
  isDark: boolean,
): [string, string, string] {
  const seed = (input ?? '').trim() || ' ';
  const hash = fnv1a(seed);
  const baseHue = hash % 360;
  const s = isDark ? 50 : 65;
  const l = isDark ? 35 : 70;
  const hueAt = (offset: number) => (baseHue + offset) % 360;
  return [
    `hsl(${hueAt(0)}, ${s}%, ${l}%)`,
    `hsl(${hueAt(50)}, ${s}%, ${l}%)`,
    `hsl(${hueAt(100)}, ${s}%, ${l}%)`,
  ];
}
