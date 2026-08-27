export function formatRemaining(totalSeconds: number): string {
  let total = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const days = Math.floor(total / 86_400);
  total %= 86_400;
  const hours = Math.floor(total / 3_600);
  total %= 3_600;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const two = (value: number): string => String(value).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${two(hours)}:${two(minutes)}`;
  }
  if (hours > 0) {
    return `${hours}:${two(minutes)}:${two(seconds)}`;
  }
  return `${two(minutes)}:${two(seconds)}`;
}
