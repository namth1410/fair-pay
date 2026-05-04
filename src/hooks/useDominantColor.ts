import { useEffect, useRef, useState } from 'react';

import { extractDominantColor, normalizeForTheme, type RawColor } from '../utils/dominantColor';
import { pickHeroGradient } from '../utils/seedGradient';
import { useAppTheme } from './useAppTheme';

/**
 * Trả về màu nền cho info section của card carousel.
 *
 * - Không có URL → fallback gradient từ seed (saturated, đẹp ngay).
 * - Có URL → render fallback trước (không nháy trắng), kích hoạt extract qua
 *   Skia ở effect, set lại khi xong. Re-clamp lightness khi đổi dark/light
 *   từ raw HSL đã cache, KHÔNG decode lại.
 */
export function useDominantColor(
  avatarUrl: string | null | undefined,
  fallbackSeed: string,
): { color: string; ready: boolean } {
  const { isDark } = useAppTheme();
  const fallback = pickHeroGradient(fallbackSeed).accent;

  const [raw, setRaw] = useState<RawColor | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!avatarUrl) {
      setRaw(null);
      return;
    }
    let cancelled = false;
    extractDominantColor(avatarUrl).then((r) => {
      if (cancelled || !isMounted.current) return;
      setRaw(r);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  if (!avatarUrl) {
    return { color: fallback, ready: true };
  }
  if (!raw) {
    return { color: fallback, ready: false };
  }
  return { color: normalizeForTheme(raw, isDark), ready: true };
}
