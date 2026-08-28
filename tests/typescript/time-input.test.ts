import { describe, expect, it } from 'vitest';
import {
  appendTimeDigit,
  formatTimeDigits,
  removeLastTimeDigit,
  sanitizeTimeDigits,
} from '../../applet/cinnamon-power-timer@irian-codes/src/time-input';

describe('time input', () => {
  it.each([
    ['', '00:00'],
    ['2', '00:02'],
    ['20', '00:20'],
    ['203', '02:03'],
    ['2034', '20:34'],
    ['16800', '168:00'],
  ])('formats %s as %s', (digits, expected) => {
    expect(formatTimeDigits(digits)).toBe(expected);
  });

  it('builds an at-time value from four digits', () => {
    let digits = '';
    for (const digit of '2034') digits = appendTimeDigit(digits, digit, 'at-time', false);
    expect(formatTimeDigits(digits)).toBe('20:34');
    expect(appendTimeDigit(digits, '5', 'at-time', false)).toBe('2034');
  });

  it('builds a countdown value without seconds', () => {
    let digits = '';
    for (const digit of '2312') digits = appendTimeDigit(digits, digit, 'countdown', false);
    expect(formatTimeDigits(digits)).toBe('23:12');
  });

  it('supports countdowns through seven days', () => {
    expect(sanitizeTimeDigits('168:00', 'countdown')).toBe('16800');
    expect(sanitizeTimeDigits('168001', 'countdown')).toBe('16800');
  });

  it('sanitizes pasted input and handles replacement', () => {
    expect(sanitizeTimeDigits('20a:34', 'at-time')).toBe('2034');
    expect(appendTimeDigit('1900', '2', 'at-time', true)).toBe('2');
    expect(removeLastTimeDigit('2034')).toBe('203');
  });
});
