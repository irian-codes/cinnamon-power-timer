export type TimerMode = 'at-time' | 'countdown';

export interface ParsedAtTime {
  mode: 'at-time';
  time: string;
  needsTomorrowConfirmation: boolean;
}

export interface ParsedCountdown {
  mode: 'countdown';
  durationSeconds: number;
}

export type ParsedTimerValue = ParsedAtTime | ParsedCountdown;

export function parseTimerValue(
  mode: TimerMode,
  value: string,
  now = new Date(),
  maxCountdownDays = 30,
): ParsedTimerValue {
  const normalized = value.trim();
  if (mode === 'at-time') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
    const hour = Number(match?.[1]);
    const minute = Number(match?.[2]);
    if (!match || hour > 23 || minute > 59) {
      throw new Error('Enter a valid 24-hour time using HH:MM.');
    }
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    return {
      mode,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      needsTomorrowConfirmation: target <= now,
    };
  }

  const configuredMaximum = Number.isFinite(maxCountdownDays)
    ? Math.max(1, Math.min(99, Math.floor(maxCountdownDays)))
    : 30;
  const match = /^(\d+)\s*d\s*(\d+)\s*h\s*(\d+)\s*m$/i.exec(normalized);
  if (!match) {
    throw new Error('Enter duration using DD d HH h MM m.');
  }
  const days = Number(match[1]);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (days > 99) throw new Error('You cannot input more than 99 d.');
  if (hours > 23) throw new Error('You cannot input more than 23 h.');
  if (minutes > 59) throw new Error('You cannot input more than 59 m.');
  const durationSeconds = days * 86_400 + hours * 3_600 + minutes * 60;
  if (durationSeconds < 60) {
    throw new Error('Duration requires at least one minute.');
  }
  if (durationSeconds > configuredMaximum * 86_400) {
    throw new Error(`Duration cannot exceed ${configuredMaximum} days.`);
  }
  return { mode, durationSeconds };
}
