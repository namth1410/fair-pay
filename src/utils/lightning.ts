/**
 * Fractal lightning generator. Tách khỏi Skia để test được như hàm thuần.
 *
 * Thuật toán: midpoint displacement đệ quy — bắt đầu với 2 điểm A→B, lặp
 * `depth` lần: mỗi cấp chèn điểm giữa lệch ngẫu nhiên theo phương vuông
 * góc, biên độ giảm dần (roughness × 0.55 mỗi cấp). Kết quả là zigzag
 * đa-tỉ-lệ (zigzag lớn chứa zigzag nhỏ) — đặc trưng "tự nhiên".
 *
 * Branches: tại các điểm giữa main bolt, xác suất p% spawn nhánh con đi
 * lệch khỏi trục chính 30–90°, đệ quy ít cấp hơn → trông như rễ cây.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Bolt {
  main: Pt[];
  branches: Pt[][];
}

function makeRng(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) & 0xffffff) / 0xffffff;
  };
}

function subdivide(
  start: Pt,
  end: Pt,
  rng: () => number,
  depth: number,
  roughness: number,
): Pt[] {
  let points: Pt[] = [start, end];
  let r = roughness;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [points[0]!];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const offset = (rng() - 0.5) * len * r;
      next.push({
        x: (a.x + b.x) / 2 + px * offset,
        y: (a.y + b.y) / 2 + py * offset,
      });
      next.push(b);
    }
    points = next;
    r *= 0.55;
  }
  return points;
}

function makeBranches(
  main: Pt[],
  rng: () => number,
  probability: number,
  maxBranches: number,
): Pt[][] {
  const branches: Pt[][] = [];
  for (let i = 4; i < main.length - 2 && branches.length < maxBranches; i += 2) {
    if (rng() >= probability) continue;
    const a = main[i]!;
    const b = main[i + 1]!;
    const mainAng = Math.atan2(b.y - a.y, b.x - a.x);
    const sign = rng() < 0.5 ? -1 : 1;
    const offsetAng = sign * (Math.PI / 6 + rng() * Math.PI / 3);
    const ang = mainAng + offsetAng;
    const len = 60 + rng() * 140;
    const end: Pt = {
      x: a.x + Math.cos(ang) * len,
      y: a.y + Math.sin(ang) * len,
    };
    branches.push(subdivide(a, end, rng, 4, 0.32));
  }
  return branches;
}

/**
 * Sét đánh có chủ đích vào 1 điểm va chạm. Sinh 1 tia chính từ đỉnh xuống
 * `target` với 4 nhánh con. Roughness thấp (0.28) + depth cao (8) → zigzag
 * mượt nhưng vẫn fractal: gấp khúc nhiều cấp thay vì vài đoạn xiên thô.
 */
export function generateImpactStrike(
  seed: number,
  width: number,
  target: Pt,
): Bolt[] {
  const rng = makeRng(seed);
  const startX = width * 0.5 + (rng() - 0.5) * width * 0.12;
  const main = subdivide(
    { x: startX, y: -30 },
    target,
    rng,
    8,
    0.28,
  );
  const branches = makeBranches(main, rng, 0.38, 4);
  return [{ main, branches }];
}
