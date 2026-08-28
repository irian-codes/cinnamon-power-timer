export type RemainingTimeFormat = 'units' | 'colon';

export function formatRemaining(
  totalSeconds: number,
  format: RemainingTimeFormat = 'units',
): string {
  let total = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const two = (value: number): string => String(value).padStart(2, '0');
  if (total < 60) return `${two(total)} s`;

  const days = Math.floor(total / 86_400);
  total %= 86_400;
  const hours = Math.floor(total / 3_600);
  total %= 3_600;
  const minutes = Math.floor(total / 60);

  if (format === 'colon') {
    if (days > 0) return `${two(days)}:${two(hours)}:${two(minutes)}`;
    if (hours > 0) return `${two(hours)}:${two(minutes)}`;
    return two(minutes);
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${two(days)} d`);
  if (hours > 0) parts.push(`${two(hours)} h`);
  if (minutes > 0) parts.push(`${two(minutes)} m`);
  return parts.join(' ');
}
