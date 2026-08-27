import { describe, expect, it } from 'vitest';
import { formatRemaining } from '../../applet/cinnamon-power-timer@irian-codes/src/timer-format';

describe('formatRemaining', () => {
  it.each([
    [2_537, '42:17'],
    [13_337, '3:42:17'],
    [186_120, '2d 03:42'],
    [-1, '00:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatRemaining(seconds)).toBe(expected);
  });
});
