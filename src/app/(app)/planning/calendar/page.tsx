import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, addMonths, monthGrid, MONTH_LABEL, parseYmd, weekDays, ymd } from "@/lib/planning/calendar";
import { importAwarenessDays } from "@/server/planning";
import { Calendar } from "@/components/planning/Calendar";
import type { CalEvent } from "@/components/planning/EventForm";

export default async function CalendarPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const sp = (k: string) => { const x = searchParams[k]; return Array.isArray(x) ? x[0] : x; };
  const view = sp("view") === "week" ? "week" : "month";
  const anchor = parseYmd(sp("date"));
  const clientFilter = sp("client") || "";
  const cells = view === "month" ? monthGrid(anchor).flat() : weekDays(anchor);
  const rangeStart = cells[0].date;
  const rangeEnd = addDays(cells[cells.length - 1].date, 1);
  const a = v.account.id;
  const inRange = { gte: rangeStart, lt: rangeEnd };

  const [rows, clients, scheduled, live, conversations, interviews] = await Promise.all([
    db.calendarEvent.findMany({ where: { accountId: a, ...(clientFilter ? { clientId: clientFilter } : {}), OR: [{ startsAt: inRange }, { AND: [{ startsAt: { lt: rangeEnd } }, { endsAt: { gte: rangeStart } }] }] }, include: { client: { select: { name: true } } }, orderBy: { startsAt: "asc" } }),
    db.client.findMany({ where: { accountId: a }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    db.release.findMany({ where: { accountId: a, deletedAt: null, status: { in: ["SCHEDULED", "DRAFT"] }, scheduledFor: inRange, ...(clientFilter ? { clientId: clientFilter } : {}) }, include: { client: { select: { name: true } } } }),
    db.release.findMany({ where: { accountId: a, deletedAt: null, status: "LIVE", publishedAt: inRange, ...(clientFilter ? { clientId: clientFilter } : {}) }, include: { client: { select: { name: true } } } }),
    clientFilter ? [] : db.conversation.findMany({ where: { accountId: a, deadline: inRange, status: { not: "CLOSED" } }, select: { id: true, outletName: true, deadline: true, question: true } }),
    clientFilter ? [] : db.interviewRequest.findMany({ where: { accountId: a, confirmedAt: inRange, status: { notIn: ["DECLINED", "CANCELLED"] } }, select: { id: true, outletName: true, spokesperson: true, confirmedAt: true, format: true } }),
  ]);
  const linked = new Set(rows.filter((e: any) => e.kind === "RELEASE" && e.entityId).map((e: any) => e.entityId));
  const events: CalEvent[] = [
    ...rows.map((e: any) => ({ id: e.id, title: e.title, kind: e.kind, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt?.toISOString() ?? null, allDay: e.allDay, color: e.color, clientId: e.clientId, clientName: e.client?.name ?? null, virtual: false, draggable: true, href: e.kind === "RELEASE" && e.entityId ? `/releases/${e.entityId}` : null })),
    ...scheduled.filter((r: any) => !linked.has(r.id)).map((r: any) => ({ id: `release:${r.id}`, title: r.headline, kind: "RELEASE", startsAt: r.scheduledFor.toISOString(), endsAt: null, allDay: false, color: null, clientId: r.clientId, clientName: r.client?.name ?? null, virtual: true, draggable: true, href: `/releases/${r.id}`, note: `${r.status === "DRAFT" ? "Draft" : "Scheduled"} release. Drag to reschedule.` })),
    ...live.map((r: any) => ({ id: `release:${r.id}`, title: r.headline, kind: "RELEASE", startsAt: r.publishedAt.toISOString(), endsAt: null, allDay: false, color: "#2E7D4F", clientId: r.clientId, clientName: r.client?.name ?? null, virtual: true, draggable: false, href: `/releases/${r.id}`, note: "Published release." })),
    ...(conversations as any[]).map((c) => ({ id: `conv:${c.id}`, title: `Deadline: ${c.outletName ?? "enquiry"}`, kind: "OTHER", startsAt: c.deadline.toISOString(), endsAt: null, allDay: false, color: "#B23B3B", clientId: null, clientName: null, virtual: true, draggable: false, href: `/response-desk/conversations/${c.id}`, note: c.question.slice(0, 160) })),
    ...(interviews as any[]).map((i) => ({ id: `interview:${i.id}`, title: `Interview: ${i.spokesperson}${i.outletName ? ` with ${i.outletName}` : ""}`, kind: "INTERVIEW", startsAt: i.confirmedAt.toISOString(), endsAt: null, allDay: false, color: null, clientId: null, clientName: null, virtual: true, draggable: false, href: `/response-desk/interviews`, note: `${i.format.replace("_", " ").toLowerCase()} interview` })),
  ];

  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, date: ymd(anchor), client: clientFilter, ...patch };
    for (const [k, val] of Object.entries(merged)) if (val && !(k === "view" && val === "month")) p.set(k, val);
    const s = p.toString();
    return `/planning/calendar${s ? `?${s}` : ""}`;
  };
  const prev = view === "month" ? addMonths(anchor, -1) : addDays(anchor, -7);
  const next = view === "month" ? addMonths(anchor, 1) : addDays(anchor, 7);
  const week = weekDays(anchor);
  const label = view === "month" ? MONTH_LABEL(anchor) : `${week[0].date.toLocaleDateString("en-CA", { month: "short", day: "numeric" })} to ${week[6].date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
  const imported = sp("imported");
  const year = anchor.getFullYear();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="ml-2 flex items-center gap-1">
          <Link href={q({ date: ymd(prev) })} className="btn px-2" aria-label="Previous">‹</Link>
          <Link href={q({ date: undefined })} className="btn">Today</Link>
          <Link href={q({ date: ymd(next) })} className="btn px-2" aria-label="Next">›</Link>
          <span className="ml-2 text-sm font-medium">{label}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-1" action={async (fd: FormData) => { "use server"; const r = await importAwarenessDays(Number(fd.get("year"))); redirect(`/planning/calendar?view=${view}&date=${ymd(anchor)}${clientFilter ? `&client=${clientFilter}` : ""}&imported=${r.created}&skipped=${r.skipped}`); }}>
            <input type="hidden" name="year" value={year} />
            <button className="btn" title="Adds the built-in Canadian awareness days as events">Import awareness days for {year}</button>
          </form>
          <form method="get" className="flex items-center gap-1">
            <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={ymd(anchor)} />
            <select name="client" className="input w-44" defaultValue={clientFilter} aria-label="Client filter">
              <option value="">All clients</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn">Filter</button>
          </form>
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
            <Link href={q({ view: "month" })} className={`px-2.5 py-1.5 text-sm ${view === "month" ? "bg-accentSoft text-accent" : "bg-white"}`}>Month</Link>
            <Link href={q({ view: "week" })} className={`px-2.5 py-1.5 text-sm ${view === "week" ? "bg-accentSoft text-accent" : "bg-white"}`}>Week</Link>
          </div>
        </div>
      </div>
      {imported !== undefined && <p className="mb-2 rounded-md bg-green-50 px-3 py-1.5 text-sm text-good" role="status">Imported {imported} awareness day{imported === "1" ? "" : "s"} for {year}{sp("skipped") && sp("skipped") !== "0" ? `; ${sp("skipped")} already existed` : ""}.</p>}
      <Calendar view={view} date={ymd(anchor)} events={events} clients={clients} />
      {!events.length && (
        <div className="card mt-4 p-8 text-center">
          <p className="mb-1 font-medium">Nothing on the calendar for this {view}.</p>
          <p className="text-sm text-neutral-600">Click a day to add an embargo, coverage moment or interview, or import the awareness days to plan pitches around.</p>
        </div>
      )}
    </div>
  );
}
