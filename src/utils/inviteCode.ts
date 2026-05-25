// Invite code helpers.
//
// Khi tạo nhóm offline, server chưa cấp invite_code thật. Client phải tự sinh
// placeholder để SQLite NOT NULL constraint không vỡ + UI có giá trị để render.
// Đánh dấu placeholder bằng prefix "PEND-" — server-gen code là 6 ký tự
// alphanumeric không chứa "-" nên không collide.
//
// Sau khi sync engine push group lên server + pullGroups overwrite local mirror,
// invite_code thật từ server thay placeholder → isPendingInviteCode trả false →
// UI hiện code + enable nút Share.

const PLACEHOLDER_PREFIX = 'PEND-';

export function generatePlaceholderInviteCode(): string {
  const random = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${PLACEHOLDER_PREFIX}${random}`;
}

export function isPendingInviteCode(code: string | null | undefined): boolean {
  return !!code && code.startsWith(PLACEHOLDER_PREFIX);
}
