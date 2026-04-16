/**
 * Split logic — BR-01: integer only, round to 1000đ, remainder to first person.
 * BR-02: total splits must equal expense amount.
 *
 * BR-01 bổ sung: Input amount phải là bội của 1.000đ. App validate trước khi gọi.
 * DB lưu cả raw_amount (gốc) và amount (đã round) để hiển thị minh bạch.
 */

export interface SplitResult {
  memberId: string;
  amount: number; // integer VND, rounded to 1000đ
}

/**
 * Chi tiết từng bước chia tiền — dùng cho tính năng "Giải thích chia tiền".
 * Giúp user hiểu tại sao số tiền mỗi người khác nhau.
 */
export interface SplitExplanation {
  total: number;
  memberCount: number;
  rawPerPerson: number;       // total / n (có thể lẻ)
  roundedPerPerson: number;   // round to 1000đ
  remainder: number;          // phần dư do làm tròn
  adjustedMemberId: string;   // người chịu phần dư
  splits: SplitResult[];
  steps: string[];            // mô tả từng bước bằng tiếng Việt
}

/**
 * Validate input amount trước khi chia.
 * BR-01: Số tiền phải là số nguyên dương, bội của 1.000đ.
 */
export function validateAmount(amount: number): string | null {
  if (!Number.isInteger(amount)) {
    return 'Số tiền phải là số nguyên';
  }
  if (amount <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  if (amount % 1000 !== 0) {
    return 'Số tiền phải là bội của 1.000đ';
  }
  return null; // valid
}

/**
 * Equal split: round to nearest 1000đ, last person absorbs remainder.
 *
 * Edge cases handled:
 * - total = 0 → all get 0
 * - total < n * 1000 → chia theo đơn vị nhỏ hơn (1đ) để fair
 * - n = 0 → empty array
 * - n = 1 → gets all
 */
export function splitEqual(total: number, memberIds: string[]): SplitResult[] {
  const n = memberIds.length;
  if (n === 0) return [];
  if (total <= 0) return memberIds.map((memberId) => ({ memberId, amount: 0 }));

  // Khi total đủ lớn để round 1000đ vẫn fair (mỗi người ≥ 1000đ)
  if (total >= n * 1000) {
    const perPerson = Math.round(total / n / 1000) * 1000;
    const subtotal = perPerson * (n - 1);
    const lastPerson = total - subtotal;

    return memberIds.map((memberId, i) => ({
      memberId,
      amount: i < n - 1 ? perPerson : lastPerson,
    }));
  }

  // Fallback: total < n * 1000 (VD: 2000đ / 3 người)
  // Chia theo đơn vị 1đ (integer), phần dư cho người cuối
  const perPerson = Math.floor(total / n);
  const lastPerson = total - perPerson * (n - 1);

  return memberIds.map((memberId, i) => ({
    memberId,
    amount: i < n - 1 ? perPerson : lastPerson,
  }));
}

/**
 * Equal split WITH explanation — giải thích từng bước.
 * Dùng cho tính năng "Tại sao tôi phải trả X đồng?"
 */
export function splitEqualWithExplanation(
  total: number,
  memberIds: string[]
): SplitExplanation {
  const n = memberIds.length;
  const steps: string[] = [];

  if (n === 0) {
    return {
      total, memberCount: 0, rawPerPerson: 0, roundedPerPerson: 0,
      remainder: 0, adjustedMemberId: '', splits: [], steps: ['Không có thành viên nào.'],
    };
  }

  const rawPerPerson = total / n;
  steps.push(
    `Bước 1: Tổng ${total.toLocaleString('vi-VN')}đ chia cho ${n} người = ${rawPerPerson.toLocaleString('vi-VN')}đ/người`
  );

  let roundedPerPerson: number;
  let remainder: number;
  let splits: SplitResult[];

  if (total >= n * 1000) {
    roundedPerPerson = Math.round(rawPerPerson / 1000) * 1000;
    const subtotal = roundedPerPerson * (n - 1);
    const lastAmount = total - subtotal;
    remainder = total - roundedPerPerson * n;

    steps.push(
      `Bước 2: Làm tròn → ${roundedPerPerson.toLocaleString('vi-VN')}đ/người (bội của 1.000đ)`
    );

    if (remainder !== 0) {
      steps.push(
        `Bước 3: Phần dư ${Math.abs(remainder).toLocaleString('vi-VN')}đ do làm tròn → ${remainder > 0 ? 'trừ bớt' : 'cộng thêm'} cho người cuối`
      );
      steps.push(
        `→ ${n - 1} người trả ${roundedPerPerson.toLocaleString('vi-VN')}đ, 1 người trả ${lastAmount.toLocaleString('vi-VN')}đ`
      );
    } else {
      steps.push(`Bước 3: Chia hết, không có phần dư.`);
    }

    splits = memberIds.map((memberId, i) => ({
      memberId,
      amount: i < n - 1 ? roundedPerPerson : lastAmount,
    }));
  } else {
    // Small amount fallback
    roundedPerPerson = Math.floor(rawPerPerson);
    remainder = total - roundedPerPerson * n;

    steps.push(
      `Bước 2: Số tiền nhỏ (< ${(n * 1000).toLocaleString('vi-VN')}đ) → chia theo đơn vị 1đ`
    );
    steps.push(
      `→ Mỗi người: ${roundedPerPerson.toLocaleString('vi-VN')}đ, phần dư ${remainder.toLocaleString('vi-VN')}đ cho người cuối`
    );

    splits = splitEqual(total, memberIds);
  }

  const adjustedMemberId = memberIds[memberIds.length - 1] || '';

  // Final step: verify
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  steps.push(`Kiểm tra: ${splits.map((s) => s.amount.toLocaleString('vi-VN')).join(' + ')} = ${sum.toLocaleString('vi-VN')}đ ✓`);

  return {
    total,
    memberCount: n,
    rawPerPerson,
    roundedPerPerson,
    remainder,
    adjustedMemberId,
    splits,
    steps,
  };
}

// ═══════════════════════════════════════════════════
// Ratio split — F-07: chia theo tỷ lệ
// ═══════════════════════════════════════════════════

export interface RatioMember {
  memberId: string;
  ratio: number; // VD: ratio=2 trong [2,1,1] → chiếm 50%
}

/**
 * Chia theo tỷ lệ: ratios = [{id, ratio:2}, {id, ratio:1}, {id, ratio:1}]
 * VD: 300k với tỷ lệ [2,1,1] → 150k, 75k, 75k
 *
 * Round to 1000đ, người cuối nhận phần dư (BR-01, BR-02).
 */
export function splitByRatio(
  total: number,
  members: RatioMember[]
): SplitResult[] {
  const n = members.length;
  if (n === 0) return [];
  if (total <= 0) return members.map((m) => ({ memberId: m.memberId, amount: 0 }));

  const sumRatios = members.reduce((sum, m) => sum + m.ratio, 0);
  if (sumRatios <= 0) return members.map((m) => ({ memberId: m.memberId, amount: 0 }));

  // Calculate each share, round to 1000đ
  const splits: SplitResult[] = [];
  let remaining = total;

  for (let i = 0; i < n; i++) {
    const member = members[i]!;
    if (i === n - 1) {
      // Last person absorbs remainder — clamp to 0 to prevent negative splits
      // from accumulated rounding (e.g. many members rounding up)
      splits.push({ memberId: member.memberId, amount: Math.max(0, remaining) });
    } else {
      const raw = (total * member.ratio) / sumRatios;
      const rounded = Math.round(raw / 1000) * 1000;
      splits.push({ memberId: member.memberId, amount: rounded });
      remaining -= rounded;
    }
  }

  return splits;
}

/**
 * Ratio split WITH explanation — giải thích từng bước.
 */
export function splitByRatioWithExplanation(
  total: number,
  members: RatioMember[]
): SplitExplanation {
  const n = members.length;
  const steps: string[] = [];

  if (n === 0) {
    return {
      total, memberCount: 0, rawPerPerson: 0, roundedPerPerson: 0,
      remainder: 0, adjustedMemberId: '', splits: [], steps: ['Không có thành viên nào.'],
    };
  }

  const sumRatios = members.reduce((sum, m) => sum + m.ratio, 0);
  const ratioStr = members.map((m) => m.ratio).join(':');
  steps.push(
    `Bước 1: Tổng ${total.toLocaleString('vi-VN')}đ chia theo tỷ lệ ${ratioStr} (tổng ${sumRatios} phần)`
  );

  const perUnit = total / sumRatios;
  steps.push(
    `Bước 2: Mỗi phần = ${perUnit.toLocaleString('vi-VN')}đ`
  );

  const splits = splitByRatio(total, members);

  const details = members.map((m, i) =>
    `${m.memberId}: ${m.ratio} phần → ${splits[i]!.amount.toLocaleString('vi-VN')}đ`
  ).join(', ');
  steps.push(`Bước 3: ${details}`);

  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  steps.push(`Kiểm tra: ${splits.map((s) => s.amount.toLocaleString('vi-VN')).join(' + ')} = ${sum.toLocaleString('vi-VN')}đ ✓`);

  return {
    total,
    memberCount: n,
    rawPerPerson: perUnit,
    roundedPerPerson: Math.round(perUnit / 1000) * 1000,
    remainder: total - Math.round(perUnit / 1000) * 1000 * n,
    adjustedMemberId: members[n - 1]?.memberId || '',
    splits,
    steps,
  };
}

// ═══════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════

/** Custom split: validate that total matches */
export function validateSplits(
  total: number,
  splits: SplitResult[]
): string | null {
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== total) {
    return `Tổng chia (${sum.toLocaleString('vi-VN')}đ) khác tổng khoản chi (${total.toLocaleString('vi-VN')}đ)`;
  }
  if (splits.some((s) => s.amount < 0)) {
    return 'Số tiền không được âm';
  }
  return null; // valid
}
