import { classifyError } from '../sync/types';

describe('classifyError — P0429 rate limit', () => {
  it('phân loại P0429 thành failed (retry, KHÔNG dead-letter)', () => {
    expect(classifyError('P0429', 'rate_limit_exceeded')).toBe('failed');
  });
});

describe('classifyError — ma trận regression', () => {
  it('P0410 → conflict', () => {
    expect(classifyError('P0410', 'version mismatch')).toBe('conflict');
  });
  it('23505 → done (idempotent duplicate)', () => {
    expect(classifyError('23505', 'duplicate key value')).toBe('done');
  });
  it('23503 (FK) → dead', () => {
    expect(classifyError('23503', 'violates foreign key')).toBe('dead');
  });
  it('42501 (permission / actor_spoof) → dead', () => {
    expect(classifyError('42501', 'actor_spoof')).toBe('dead');
  });
  it('P0002 (not found) → dead', () => {
    expect(classifyError('P0002', 'trip_not_found')).toBe('dead');
  });
  it('lỗi mạng → failed', () => {
    expect(classifyError(null, 'Network request failed')).toBe('failed');
  });
  it('lỗi không xác định → failed (safe default)', () => {
    expect(classifyError(null, 'something unexpected')).toBe('failed');
  });
});
