import { isNetworkError } from '../utils/network';

describe('isNetworkError — message patterns', () => {
  it('matches RN default fetch TypeError on iOS/Android', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
  });

  it('matches web fetch failure', () => {
    expect(isNetworkError({ message: 'Failed to fetch' })).toBe(true);
  });

  it('matches Android DNS resolution failure', () => {
    expect(
      isNetworkError({
        message: 'Unable to resolve host "xyz.supabase.co": No address associated',
      })
    ).toBe(true);
  });

  it('matches Android connection refused', () => {
    expect(
      isNetworkError({ message: 'Failed to connect to /192.168.1.10:443' })
    ).toBe(true);
  });

  it('matches Axios-style "Network Error" on RN', () => {
    expect(isNetworkError({ message: 'Network Error' })).toBe(true);
  });

  it('matches iOS Safari "Load failed"', () => {
    expect(isNetworkError({ message: 'Load failed' })).toBe(true);
  });

  it('matches generic timeout variants', () => {
    expect(isNetworkError({ message: 'Request timeout' })).toBe(true);
    expect(isNetworkError({ message: 'Operation timed out' })).toBe(true);
  });
});

describe('isNetworkError — AbortController', () => {
  it('matches AbortError by name', () => {
    expect(
      isNetworkError({ name: 'AbortError', message: 'The operation was aborted' })
    ).toBe(true);
  });

  it('matches when message says aborted but name differs', () => {
    expect(isNetworkError({ message: 'Request was aborted' })).toBe(true);
  });
});

describe('isNetworkError — Node-style error codes', () => {
  it('matches ECONNRESET with no message', () => {
    expect(isNetworkError({ code: 'ECONNRESET' })).toBe(true);
  });

  it('matches ETIMEDOUT with empty message', () => {
    expect(isNetworkError({ code: 'ETIMEDOUT', message: '' })).toBe(true);
  });

  it('matches ENOTFOUND (DNS failure)', () => {
    expect(isNetworkError({ code: 'ENOTFOUND' })).toBe(true);
  });

  it('matches ECONNREFUSED', () => {
    expect(isNetworkError({ code: 'ECONNREFUSED' })).toBe(true);
  });
});

describe('isNetworkError — non-network errors (must NOT match)', () => {
  it('rejects Postgres RLS permission denied (42501)', () => {
    expect(
      isNetworkError({
        code: '42501',
        message: 'permission denied for table groups',
      })
    ).toBe(false);
  });

  it('rejects optimistic concurrency conflict (P0410)', () => {
    expect(
      isNetworkError({ code: 'P0410', message: 'version mismatch' })
    ).toBe(false);
  });

  it('rejects validation error', () => {
    expect(isNetworkError(new Error('Tên nhóm không được để trống'))).toBe(false);
  });

  it('rejects unknown error', () => {
    expect(isNetworkError(new Error('Something went wrong'))).toBe(false);
  });
});

describe('isNetworkError — safety', () => {
  it('returns false for null', () => {
    expect(isNetworkError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNetworkError(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isNetworkError({})).toBe(false);
  });

  it('returns false for string error without network keyword', () => {
    expect(isNetworkError('some unrelated text')).toBe(false);
  });
});
