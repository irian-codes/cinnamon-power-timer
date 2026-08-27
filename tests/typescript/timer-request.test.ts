import { describe, expect, it } from 'vitest';
import { parseTimerValue } from '../../applet/cinnamon-power-timer@irian-codes/src/timer-request';

describe('parseTimerValue', () => {
  it('normalizes an at-time value', () => {
    expect(parseTimerValue('at-time', '9:05', new Date(2026, 7, 27, 8, 0))).toEqual({
      mode: 'at-time',
      time: '09:05',
      needsTomorrowConfirmation: false,
    });
  });

  it('detects a target requiring tomorrow confirmation', () => {
    expect(parseTimerValue('at-time', '19:00', new Date(2026, 7, 27, 20, 0))).toMatchObject({
      needsTomorrowConfirmation: true,
    });
  });

  it('parses a countdown value', () => {
    expect(parseTimerValue('countdown', '01:02:03')).toEqual({
      mode: 'countdown',
      durationSeconds: 3_723,
    });
  });

  it.each(['24:00', '10:60', 'abc'])('rejects invalid at-time value %s', (value) => {
    expect(() => parseTimerValue('at-time', value)).toThrow('valid 24-hour time');
  });

  it.each(['00:00:00', '00:60:00', '1000:00:00'])('rejects invalid countdown %s', (value) => {
    expect(() => parseTimerValue('countdown', value)).toThrow();
  });
});
