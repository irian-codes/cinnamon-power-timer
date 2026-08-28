import type { TimerMode } from './timer-request';

export function maxTimeDigits(mode: TimerMode): number {
  return mode === 'countdown' ? 6 : 4;
}

export function sanitizeTimeDigits(value: string, mode: TimerMode): string {
  return value.replace(/\D/g, '').slice(0, maxTimeDigits(mode));
}

export function formatTimeDigits(digits: string, mode: TimerMode): string {
  if (mode === 'countdown') {
    const padded = digits.padStart(6, '0');
    return `${padded.slice(0, 2)} d ${padded.slice(2, 4)} h ${padded.slice(4, 6)} m`;
  }
  const padded = digits.padStart(4, '0');
  return `${padded.slice(0, -2)}:${padded.slice(-2)}`;
}

export function appendTimeDigit(
  current: string,
  digit: string,
  mode: TimerMode,
  replace: boolean,
): string {
  if (!/^\d$/.test(digit)) return current;
  if (replace) return digit;
  if (current.length >= maxTimeDigits(mode)) return current;
  return `${current}${digit}`;
}

export function removeLastTimeDigit(current: string): string {
  return current.slice(0, -1);
}
