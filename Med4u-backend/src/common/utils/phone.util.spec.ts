import { normalizePhone, E164_REGEX } from './phone.util';

describe('normalizePhone', () => {
  it.each([
    ['1111111111', '+911111111111'],
    ['  11111 11111 ', '+911111111111'],
    ['01111111111', '+911111111111'],
    ['911111111111', '+911111111111'],
    ['+91 98765-43210', '+919876543210'],
    ['(+91) 98765 43210', '+919876543210'],
    ['0091 9876543210', '+919876543210'],
    ['+14155552671', '+14155552671'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = normalizePhone('1111111111');
    expect(normalizePhone(once)).toBe(once);
  });

  it.each(['12345', 'abcdefghij', '', '+', '123456789012345678'])('leaves %p invalid', (input) => {
    expect(E164_REGEX.test(normalizePhone(input))).toBe(false);
  });
});
