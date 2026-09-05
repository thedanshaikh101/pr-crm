// Pure aggregation helpers for the charts and reports. Weeks start on Monday; keys are local YYYY-MM-DD.

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function startOfWeekMon(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7));
}

export type WeekBucket<T> = { key: string; start: Date; items: T[]; count: number };

function dateOf<T>(item: T, dateKey: keyof T | ((x: T) => Date | string | null | undefined)) {
  const raw = typeof dateKey === "function" ? dateKey(item) : (item[dateKey] as unknown as Date | string | null | undefined);
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Every week from `from` to `to` inclusive (empty weeks included), with the items whose date falls in it. */
export function bucketByWeek<T>(items: T[], dateKey: keyof T | ((x: T) => Date | string | null | undefined), from: Date, to: Date): WeekBucket<T>[] {
  const start = startOfWeekMon(from);
  const end = startOfWeekMon(to);
  const buckets: WeekBucket<T>[] = [];
  const index = new Map<string, WeekBucket<T>>();
  for (let w = start; w <= end; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
    const b = { key: dayKey(w), start: w, items: [] as T[], count: 0 };
    buckets.push(b); index.set(b.key, b);
  }
  for (const it of items) {
    const d = dateOf(it, dateKey);
    if (!d) continue;
    const b = index.get(dayKey(startOfWeekMon(d)));
    if (b) { b.items.push(it); b.count++; }
  }
  return buckets;
}

/** Every month from `from` to `to` inclusive. */
export function bucketByMonth<T>(items: T[], dateKey: keyof T | ((x: T) => Date | string | null | undefined), from: Date, to: Date): WeekBucket<T>[] {
  const buckets: WeekBucket<T>[] = [];
  const index = new Map<string, WeekBucket<T>>();
  for (let m = new Date(from.getFullYear(), from.getMonth(), 1); m <= to; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const b = { key: monthKey(m), start: m, items: [] as T[], count: 0 };
    buckets.push(b); index.set(b.key, b);
  }
  for (const it of items) {
    const d = dateOf(it, dateKey);
    if (!d) continue;
    const b = index.get(monthKey(d));
    if (b) { b.items.push(it); b.count++; }
  }
  return buckets;
}

/** Count items by the value of `key` (or a getter). */
export function stackBy<T>(items: T[], key: keyof T | ((x: T) => string | null | undefined)): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = String((typeof key === "function" ? key(it) : it[key]) ?? "UNKNOWN");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Sum a numeric field. */
export function sumBy<T>(items: T[], key: keyof T | ((x: T) => number | null | undefined)) {
  return items.reduce((n, it) => n + (Number(typeof key === "function" ? key(it) : it[key]) || 0), 0);
}

/** Percentage 0..100 with one decimal; 0 when the denominator is 0. */
export function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Date-range presets used by the charts and reports. */
export function rangeFor(preset: string | undefined, from?: string, to?: string) {
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(to + "T23:59:59.999") : new Date();
  let start: Date;
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) start = new Date(from + "T00:00:00");
  else {
    const days = preset === "12m" ? 365 : preset === "90d" ? 90 : 30;
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
  }
  if (start > end) start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
  return { from: start, to: end, preset: from ? undefined : (preset === "12m" || preset === "90d" ? preset : "30d") };
}
