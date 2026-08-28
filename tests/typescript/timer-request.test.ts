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
    expect(parseTimerValue('countdown', '03 d 12 h 45 m')).toEqual({
      mode: 'countdown',
      durationSeconds: 305_100,
    });
  });

  it('uses the configured countdown maximum', () => {
    expect(parseTimerValue('countdown', '45 d 00 h 00 m', new Date(), 45)).toEqual({
      mode: 'countdown',
      durationSeconds: 3_888_000,
    });
    expect(() => parseTimerValue('countdown', '45 d 00 h 01 m', new Date(), 45)).toThrow('45 days');
  });

  it('requires a minimum countdown of one minute', () => {
    expect(() => parseTimerValue('countdown', '00 d 00 h 00 m')).toThrow('at least one minute');
  });

  it.each([
    ['100 d 00 h 00 m', 'You cannot input more than 99 d.'],
    ['00 d 24 h 00 m', 'You cannot input more than 23 h.'],
    ['00 d 00 h 60 m', 'You cannot input more than 59 m.'],
  ])('explains the invalid countdown unit in %s', (value, message) => {
    expect(() => parseTimerValue('countdown', value)).toThrow(message);
  });

  it.each(['24:00', '10:60', 'abc'])('rejects invalid at-time value %s', (value) => {
    expect(() => parseTimerValue('at-time', value)).toThrow('valid 24-hour time');
  });

  it.each(['30 d 00 h 01 m', '31 d 00 h 00 m', '01:02'])(
    'rejects invalid countdown %s',
    (value) => {
      expect(() => parseTimerValue('countdown', value)).toThrow();
    },
  );
});
