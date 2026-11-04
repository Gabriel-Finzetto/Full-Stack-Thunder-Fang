import type { BusinessDays } from '@/contracts/api';

export type ArrivalEstimate = { earliest: string | null; latest: string };
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar estimate only: the order day is day zero; weekends do not count. */
export function estimateArrival(createdAt: string, days: BusinessDays): ArrivalEstimate | null {
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime()) || !Number.isSafeInteger(days.max) || days.max < 1 || days.max > 10_000
    || (days.min !== null && (!Number.isSafeInteger(days.min) || days.min < 0 || days.min > days.max))) return null;
  const parts = calendar.formatToParts(created);
  const part = (name: string) => Number(parts.find(value => value.type === name)?.value);
  const base = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const add = (count: number) => {
    const date = new Date(base);
    // Fast-forward whole working weeks after normalizing a weekend start.
    if (count > 0 && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) {
      date.setUTCDate(date.getUTCDate() + (date.getUTCDay() === 6 ? 2 : 1));
      count -= 1;
    }
    date.setUTCDate(date.getUTCDate() + Math.floor(count / 5) * 7);
    for (let remaining = count % 5; remaining > 0;) {
      date.setUTCDate(date.getUTCDate() + 1);
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1;
    }
    return date.toISOString().slice(0, 10);
  };
  return { earliest: days.min === null ? null : add(days.min), latest: add(days.max) };
}
