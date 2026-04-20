import {
  validateEmail,
  validateName,
  validatePositiveAmount,
} from '../utils/validate';

describe('validateEmail', () => {
  it('accepts typical addresses', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('user.name+tag@example.com')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(validateEmail('  a@b.co  ')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(validateEmail('')).toBe('Email không được để trống');
    expect(validateEmail('   ')).toBe('Email không được để trống');
  });

  it('rejects malformed addresses', () => {
    expect(validateEmail('not-an-email')).toBe('Email không hợp lệ');
    expect(validateEmail('missing@tld')).toBe('Email không hợp lệ');
    expect(validateEmail('@nodomain.com')).toBe('Email không hợp lệ');
    expect(validateEmail('spaces in@email.com')).toBe('Email không hợp lệ');
  });
});

describe('validateName', () => {
  it('rejects empty and over-length names', () => {
    expect(validateName('', 'Tên')).toBe('Tên không được để trống');
    expect(validateName('x'.repeat(101), 'Tên')).toBe(
      'Tên không được quá 100 ký tự'
    );
  });

  it('accepts trimmed valid names', () => {
    expect(validateName('Nam', 'Tên')).toBeNull();
  });
});

describe('validatePositiveAmount', () => {
  it('rejects non-positive or non-integer', () => {
    expect(validatePositiveAmount(0)).not.toBeNull();
    expect(validatePositiveAmount(-1)).not.toBeNull();
    expect(validatePositiveAmount(1.5)).not.toBeNull();
  });

  it('accepts positive integers', () => {
    expect(validatePositiveAmount(1000)).toBeNull();
  });
});
