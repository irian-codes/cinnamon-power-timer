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

  const match = /^(\d{1,3}):(\d{2})$/.exec(normalized);
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  if (!match || minutes > 59) {
    throw new Error('Enter duration using HH:MM.');
  }
  const durationSeconds = hours * 3_600 + minutes * 60;
  if (durationSeconds < 60 || durationSeconds > 604_800) {
    throw new Error('Duration must be between one minute and seven days.');
  }
  return { mode, durationSeconds };
}
