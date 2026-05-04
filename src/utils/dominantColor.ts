import { Skia } from '@shopify/react-native-skia';

// Sample size — đủ lớn để trung bình bilinear ổn định, đủ nhỏ để rẻ.
const SAMPLE = 8;

// Cache theo URL ngoài module — sống theo session app, hợp với tập <50 nhóm
// thông thường nên không cần LRU. Nếu sau này groups.length tăng > vài trăm,
// thay bằng Map có maxSize + FIFO eviction.
const cache = new Map<string, RawColor | null>();

export interface RawColor {
  /** 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  /** 0-1 */
  l: number;
}

/**
 * Decode + sample dominant color của image qua Skia. Trả về raw HSL (chưa
 * normalize) để caller (hook) tự clamp theo theme tại render time, tránh
 * phải decode lại khi user đổi dark/light.
 *
 * Trả `null` nếu lỗi mạng / decode fail / image trong suốt hoàn toàn.
 */
export async function extractDominantColor(url: string): Promise<RawColor | null> {
  if (cache.has(url)) {
    return cache.get(url) ?? null;
  }

  let result: RawColor | null = null;
  try {
    const data = await Skia.Data.fromURI(url);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) {
      cache.set(url, null);
      return null;
    }

    const surface = Skia.Surface.Make(SAMPLE, SAMPLE);
    if (!surface) {
      cache.set(url, null);
      return null;
    }

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, SAMPLE, SAMPLE),
      paint,
    );
    const pixels = surface.makeImageSnapshot().readPixels();
    if (!pixels) {
      cache.set(url, null);
      return null;
    }

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    // readPixels trả Uint8Array RGBA8888 (mặc định) — 4 byte/pixel.
    const len = SAMPLE * SAMPLE * 4;
    for (let i = 0; i < len; i += 4) {
      const a = pixels[i + 3] ?? 0;
      if (a < 128) continue;
      r += pixels[i] ?? 0;
      g += pixels[i + 1] ?? 0;
      b += pixels[i + 2] ?? 0;
      count++;
    }
    if (count === 0) {
      cache.set(url, null);
      return null;
    }

    result = rgbToHsl(r / count, g / count, b / count);
  } catch {
    result = null;
  }

  cache.set(url, result);
  return result;
}

/** Normalize hue/sat/lightness về dải đẹp + dễ đọc theo theme. */
export function normalizeForTheme(raw: RawColor, isDark: boolean): string {
  const s = Math.max(0.35, Math.min(0.85, raw.s));
  let l: number;
  if (isDark) {
    l = Math.max(0.22, Math.min(0.36, raw.l));
  } else {
    l = Math.max(0.62, Math.min(0.78, raw.l));
  }
  return `hsl(${Math.round(raw.h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function rgbToHsl(r: number, g: number, b: number): RawColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) {
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
    } else if (max === gn) {
      h = (bn - rn) / d + 2;
    } else {
      h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}
