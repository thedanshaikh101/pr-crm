import { describe, expect, it } from "vitest";
import { bucketEvents, monthGrid, weekDays, ymd } from "@/lib/planning/calendar";
import { awarenessDaysFor, givingTuesday, nthWeekday, victoriaDay } from "@/lib/planning/awarenessDays";
import { bucketByMonth, bucketByWeek, rate, rangeFor, stackBy } from "@/lib/planning/agg";

describe("monthGrid", () => {
  it("returns 6 rows of 7 starting on a Sunday and flags in-month days", () => {
    const g = monthGrid(new Date(2026, 8, 15)); // September 2026 starts on a Tuesday
    expect(g).toHaveLength(6);
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(g[0][0].key).toBe("2026-08-30");
    expect(g[0][0].dow).toBe(0);
    expect(g[0][0].inMonth).toBe(false);
    expect(g[0][2].key).toBe("2026-09-01");
    expect(g[0][2].inMonth).toBe(true);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(g[5][6].key).toBe("2026-10-10");
  });
  it("weekDays covers Sunday to Saturday around the date", () => {
    const w = weekDays(new Date(2026, 8, 5)); // Saturday
    expect(w.map((c) => c.key)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
  });
});

describe("bucketEvents", () => {
  const cells = weekDays(new Date(2026, 8, 2));
  it("places single-day events and spans multi-day ones", () => {
    const b = bucketEvents([
      { id: "a", startsAt: new Date(2026, 8, 1, 9), allDay: false },
      { id: "b", startsAt: new Date(2026, 8, 2), endsAt: new Date(2026, 8, 4), allDay: true },
      { id: "c", startsAt: new Date(2026, 7, 1), allDay: true },
    ], cells);
    expect(b["2026-09-01"].map((e) => e.id)).toEqual(["a"]);
    expect(b["2026-09-02"].map((e) => e.id)).toEqual(["b"]);
    expect(b["2026-09-03"].map((e) => e.id)).toEqual(["b"]);
    expect(b["2026-09-04"].map((e) => e.id)).toEqual(["b"]);
    expect(b["2026-09-05"]).toEqual([]);
    expect(Object.values(b).flat().some((e) => e.id === "c")).toBe(false);
  });
  it("sorts all-day first then by time and accepts nested grids", () => {
    const b = bucketEvents([{ id: "t", startsAt: "2026-09-01T15:00:00", allDay: false }, { id: "m", startsAt: "2026-09-01T08:00:00", allDay: false }, { id: "d", startsAt: "2026-09-01T00:00:00", allDay: true }], monthGrid(new Date(2026, 8, 1)));
    expect(b["2026-09-01"].map((e) => e.id)).toEqual(["d", "m", "t"]);
  });
});

describe("awareness days", () => {
  it("computes rule-based dates", () => {
    expect(ymd(nthWeekday(2026, 1, 3, 1, true))).toBe("2026-01-28"); // Bell Let's Talk: last Wednesday of January 2026
    expect(ymd(nthWeekday(2026, 5, 1, 1))).toBe("2026-05-04"); // Mental Health Week: first Monday of May
    expect(ymd(nthWeekday(2026, 10, 1, 2))).toBe("2026-10-12"); // Thanksgiving
    expect(ymd(givingTuesday(2026))).toBe("2026-12-01");
    expect(ymd(givingTuesday(2025))).toBe("2025-12-02");
    expect(ymd(victoriaDay(2026))).toBe("2026-05-18");
    expect(ymd(victoriaDay(2025))).toBe("2025-05-19");
  });
  it("lists at least 30 days per year with fixed dates in place", () => {
    const days = awarenessDaysFor(2026);
    expect(days.length).toBeGreaterThanOrEqual(30);
    const find = (t: string) => days.find((x) => x.title === t)!;
    expect(ymd(find("International Women's Day").date)).toBe("2026-03-08");
    expect(ymd(find("Canada Day").date)).toBe("2026-07-01");
    expect(ymd(find("Remembrance Day").date)).toBe("2026-11-11");
    expect(ymd(find("Bell Let's Talk Day").date)).toBe("2026-01-28");
    expect(ymd(find("Small Business Week begins").date)).toBe("2026-10-18");
    for (let i = 1; i < days.length; i++) expect(days[i].date.getTime()).toBeGreaterThanOrEqual(days[i - 1].date.getTime());
  });
});

describe("aggregation", () => {
  it("bucketByWeek fills empty weeks and assigns by Monday start", () => {
    const items = [{ at: new Date(2026, 8, 1) }, { at: new Date(2026, 8, 6) }, { at: new Date(2026, 8, 7) }, { at: null }, { at: new Date(2026, 6, 1) }];
    const b = bucketByWeek(items, "at", new Date(2026, 7, 31), new Date(2026, 8, 20));
    expect(b.map((x) => x.key)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
    expect(b.map((x) => x.count)).toEqual([2, 1, 0]);
  });
  it("bucketByMonth and stackBy and rate", () => {
    const b = bucketByMonth([{ d: "2026-02-10" }, { d: "2026-04-01" }], (x) => x.d, new Date(2026, 1, 1), new Date(2026, 3, 15));
    expect(b.map((x) => `${x.key}:${x.count}`)).toEqual(["2026-02:1", "2026-03:0", "2026-04:1"]);
    expect(stackBy([{ t: "A" }, { t: "B" }, { t: "A" }, { t: null }], "t")).toEqual({ A: 2, B: 1, UNKNOWN: 1 });
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(5, 0)).toBe(0);
  });
  it("rangeFor presets", () => {
    const r = rangeFor("90d");
    expect(Math.round((r.to.getTime() - r.from.getTime()) / 864e5)).toBe(89);
    expect(r.preset).toBe("90d");
    const c = rangeFor(undefined, "2026-01-01", "2026-01-31");
    expect(c.from.getFullYear()).toBe(2026);
    expect(c.preset).toBeUndefined();
  });
});
