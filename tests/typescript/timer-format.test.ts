import { describe, expect, it } from 'vitest';
import { formatRemaining } from '../../applet/cinnamon-power-timer@irian-codes/src/timer-format';

describe('formatRemaining', () => {
  it.each([
    [2 * 86_400 + 12 * 3_600 + 23 * 60 + 42, '02 d 12 h 23 m'],
    [2 * 86_400 + 23 * 60, '02 d 23 m'],
    [12 * 3_600, '12 h'],
    [23 * 60, '23 m'],
    [59, '59 s'],
    [5, '05 s'],
    [-1, '00 s'],
  ])('formats %i seconds using unit labels as %s', (seconds, expected) => {
    expect(formatRemaining(seconds)).toBe(expected);
  });

  it.each([
    [2 * 86_400 + 12 * 3_600 + 23 * 60 + 42, '02:12:23'],
    [2 * 86_400 + 23 * 60, '02:00:23'],
    [12 * 3_600 + 23 * 60, '12:23'],
    [23 * 60, '23'],
    [59, '59 s'],
  ])('formats %i seconds using positional values as %s', (seconds, expected) => {
    expect(formatRemaining(seconds, 'colon')).toBe(expected);
  });
});
