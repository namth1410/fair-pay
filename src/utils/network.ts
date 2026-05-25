// Pure network error classifier — chỉ dùng object property check, không phụ
// thuộc bất kỳ native module nào (RN/Expo/zustand). Đảm bảo testable trong
// Jest node env.
//
// Whitelist message patterns + Node-style codes + AbortError covering thực tế:
// - RN iOS/Android default fetch: `TypeError: Network request failed`
// - Web fetch:                    `TypeError: Failed to fetch`
// - Axios on RN:                  `Network Error`
// - iOS Safari/WebKit:            `Load failed`
// - Android DNS / connection:     `Unable to resolve host`, `Failed to connect`
// - Generic:                       `timeout`, `aborted`, `connection refused`,
//                                  `network is unreachable`
// - Node codes:                    ENOTFOUND, ECONNRESET, ECONNABORTED,
//                                  ECONNREFUSED, ETIMEDOUT
// - AbortController:               DOMException name='AbortError'

const NETWORK_MESSAGE_PATTERNS = [
  'failed to fetch',
  'network request failed',
  'network error',
  'timeout',
  'timed out',
  'aborted',
  'load failed',
  'unable to resolve host',
  'failed to connect',
  'connection refused',
  'network is unreachable',
];

const NETWORK_CODE_PATTERNS = [
  'enotfound',
  'econnreset',
  'econnaborted',
  'econnrefused',
  'etimedout',
];

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;

  if ((err as { name?: string })?.name === 'AbortError') return true;

  const msg = ((err as { message?: string })?.message ?? '').toLowerCase();
  if (NETWORK_MESSAGE_PATTERNS.some((p) => msg.includes(p))) return true;

  const code = ((err as { code?: string })?.code ?? '').toLowerCase();
  if (code && NETWORK_CODE_PATTERNS.some((p) => code.includes(p))) return true;

  return false;
}
