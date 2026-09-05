// Pure calendar helpers. Weeks start on Sunday. Dates are handled in local time of the caller.

export type DayCell = { date: Date; key: string; inMonth: boolean; dow: number };

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseYmd(s: string | null | undefined, fallback = new Date()): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()) : d;
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());

/** 6 rows x 7 days covering the month of `date`, starting on the Sunday on or before the 1st. */
export function monthGrid(date: Date): DayCell[][] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const rows: DayCell[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: DayCell[] = [];
    for (let c = 0; c < 7; c++) {
      const d = addDays(start, r * 7 + c);
      row.push({ date: d, key: ymd(d), inMonth: d.getMonth() === date.getMonth(), dow: d.getDay() });
    }
    rows.push(row);
  }
  return rows;
}

/** The 7 days of the week containing `date`, Sunday first. */
export function weekDays(date: Date): DayCell[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { date: d, key: ymd(d), inMonth: d.getMonth() === date.getMonth(), dow: d.getDay() }; });
}

export type CalendarItem = { id: string; startsAt: string | Date; endsAt?: string | Date | null; allDay?: boolean };

/** Map of day key -> events that touch that day (multi-day all-day events span every day in range). Only days in `cells` are returned. */
export function bucketEvents<T extends CalendarItem>(events: T[], cells: DayCell[] | DayCell[][]): Record<string, T[]> {
  const flat = (Array.isArray(cells[0]) ? (cells as DayCell[][]).flat() : (cells as DayCell[]));
  const out: Record<string, T[]> = {};
  for (const c of flat) out[c.key] = [];
  if (!flat.length) return out;
  const min = flat[0].date.getTime();
  const max = addDays(flat[flat.length - 1].date, 1).getTime();
  for (const e of events) {
    const s = new Date(e.startsAt);
    if (isNaN(s.getTime())) continue;
    let end = e.endsAt ? new Date(e.endsAt) : s;
    if (isNaN(end.getTime()) || end < s) end = s;
    // A timed event that ends exactly at midnight belongs to the previous day.
    if (!e.allDay && end > s && end.getHours() === 0 && end.getMinutes() === 0) end = new Date(end.getTime() - 1);
    const last = e.allDay ? startOfDay(end) : startOfDay(end);
    for (let d = startOfDay(s); d <= last; d = addDays(d, 1)) {
      const t = d.getTime();
      if (t < min || t >= max) continue;
      const k = ymd(d);
      if (out[k]) out[k].push(e);
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return out;
}

export const MONTH_LABEL = (d: Date) => d.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const KIND_ICON: Record<string, string> = { RELEASE: "📣", COVERAGE_MOMENT: "📰", AWARENESS_DAY: "🎗", INTERVIEW: "🎤", EMBARGO: "🔒", OTHER: "•" };
export const KIND_LABEL: Record<string, string> = { RELEASE: "Release", COVERAGE_MOMENT: "Coverage moment", AWARENESS_DAY: "Awareness day", INTERVIEW: "Interview", EMBARGO: "Embargo", OTHER: "Other" };
export const KINDS = ["RELEASE", "COVERAGE_MOMENT", "AWARENESS_DAY", "INTERVIEW", "EMBARGO", "OTHER"] as const;
