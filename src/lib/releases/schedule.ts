/** Interpret a datetime-local string ("2026-09-10T14:30") in an IANA timezone and return the UTC instant. */
export function localToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local?.trim() ?? "");
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = asUtc;
  // Two passes handle DST transitions: offset at the guess, then re-evaluate at the corrected instant.
  for (let i = 0; i < 2; i++) guess = asUtc - offsetMs(guess, timeZone);
  return new Date(guess);
}

/** Offset (ms) of `timeZone` from UTC at the given instant. Falls back to UTC for unknown zones. */
export function offsetMs(instant: number, timeZone: string) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return 0; }
  const p: Record<string, number> = {};
  for (const x of fmt.formatToParts(new Date(instant))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  return local - Math.floor(instant / 1000) * 1000;
}

/** Format a UTC instant as a datetime-local string in a timezone (for prefilling inputs). */
export function utcToLocalInput(date: Date, timeZone: string) {
  const shifted = new Date(date.getTime() + offsetMs(date.getTime(), timeZone));
  return shifted.toISOString().slice(0, 16);
}
