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
  ])('formats %s as %s', (digits, expected) => {
    expect(formatTimeDigits(digits, 'at-time')).toBe(expected);
  });

  it('builds an at-time value from four digits', () => {
    let digits = '';
    for (const digit of '2034') digits = appendTimeDigit(digits, digit, 'at-time', false);
    expect(formatTimeDigits(digits, 'at-time')).toBe('20:34');
    expect(appendTimeDigit(digits, '5', 'at-time', false)).toBe('2034');
  });

  it('builds a countdown value using days, hours, and minutes', () => {
    let digits = '';
    for (const digit of '031245') digits = appendTimeDigit(digits, digit, 'countdown', false);
    expect(formatTimeDigits(digits, 'countdown')).toBe('03 d 12 h 45 m');
  });

  it('supports countdowns through thirty days', () => {
    expect(sanitizeTimeDigits('30 d 00 h 00 m', 'countdown')).toBe('300000');
    expect(sanitizeTimeDigits('3000001', 'countdown')).toBe('300000');
  });

  it('sanitizes pasted input and handles replacement', () => {
    expect(sanitizeTimeDigits('20a:34', 'at-time')).toBe('2034');
    expect(appendTimeDigit('1900', '2', 'at-time', true)).toBe('2');
    expect(removeLastTimeDigit('2034')).toBe('203');
  });
});
