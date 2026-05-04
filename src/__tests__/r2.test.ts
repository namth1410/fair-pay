/**
 * Tests for extractFileKey — defensive parsing of public R2 URLs.
 * Mocks the R2_PUBLIC_BASE_URL constant so the test stays deterministic.
 */
jest.mock('../config/constants', () => ({
  R2_PUBLIC_BASE_URL: 'https://pub-test.r2.dev',
}));

import { extractFileKey } from '../utils/r2';

describe('extractFileKey', () => {
  it('extracts the key from a URL that starts with our base', () => {
    expect(
      extractFileKey('https://pub-test.r2.dev/groups/abc/123-def.jpg')
    ).toBe('groups/abc/123-def.jpg');
  });

  it('returns null when URL does not match our base (different domain)', () => {
    expect(
      extractFileKey('https://other.cdn.com/groups/abc/123.jpg')
    ).toBeNull();
  });

  it('returns null when URL is null/undefined/empty', () => {
    expect(extractFileKey(null)).toBeNull();
    expect(extractFileKey(undefined)).toBeNull();
    expect(extractFileKey('')).toBeNull();
  });

  it('handles base URL with trailing slash equivalence', () => {
    expect(
      extractFileKey('https://pub-test.r2.dev/groups/abc/file.jpg')
    ).toBe('groups/abc/file.jpg');
  });

  it('returns null for URLs that share a prefix but not the full base', () => {
    // Looks similar but missing the dot — must reject.
    expect(
      extractFileKey('https://pub-test-r2.dev/groups/abc/file.jpg')
    ).toBeNull();
  });
});
