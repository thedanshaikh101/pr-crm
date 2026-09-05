"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveEvent } from "@/server/planning";
import { bucketEvents, KIND_ICON, monthGrid, parseYmd, weekDays, WEEKDAY_SHORT, type DayCell } from "@/lib/planning/calendar";
import { EventForm, VirtualEventCard, localYmd, type CalEvent, type ClientOpt } from "./EventForm";

const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i); // 7:00 to 20:00
const HOUR_PX = 44;

function colorOf(e: CalEvent, clients: ClientOpt[]) {
  return e.color ?? clients.find((c) => c.id === e.clientId)?.color ?? (e.kind === "AWARENESS_DAY" ? "#B8860B" : e.kind === "EMBARGO" ? "#B23B3B" : "#1F5FBF");
}

function Chip({ e, clients, onOpen, onDragStart, timed }: { e: CalEvent; clients: ClientOpt[]; onOpen: (e: CalEvent) => void; onDragStart: (e: CalEvent) => void; timed?: boolean }) {
  const color = colorOf(e, clients);
  const s = new Date(e.startsAt);
  return (
    <button
      type="button" draggable={e.draggable} onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", e.id); ev.dataTransfer.effectAllowed = "move"; onDragStart(e); }}
      onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}
      className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-4 ${e.draggable ? "cursor-grab" : "cursor-pointer"} ${e.virtual ? "border border-dashed" : ""}`}
      style={{ background: color + "22", color, borderColor: color }} title={`${e.title}${e.clientName ? ` (${e.clientName})` : ""}`}
    >
      <span aria-hidden>{KIND_ICON[e.kind] ?? "•"}</span>
      {!e.allDay && !timed && <span className="shrink-0 text-[10px] opacity-80">{s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
      <span className="truncate">{e.title}</span>
    </button>
  );
}

function Popover({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/20 p-4 pt-24" role="dialog" aria-label={title} onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-sm font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Calendar({ view, date, events, clients }: { view: "month" | "week"; date: string; events: CalEvent[]; clients: ClientOpt[] }) {
  const router = useRouter();
  const anchor = parseYmd(date);
  const [today, setToday] = useState<string>("");
  useEffect(() => { setToday(localYmd(new Date())); }, []);
  const [newDay, setNewDay] = useState<string | null>(null);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragging, setDragging] = useState<CalEvent | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setNewDay(null); setExpanded(null); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const drop = (dayKey: string) => {
    setOver(null);
    const e = dragging; setDragging(null);
    if (!e || !e.draggable) return;
    const s = new Date(e.startsAt);
    const target = parseYmd(dayKey);
    if (localYmd(s) === dayKey) return;
    const next = new Date(target.getFullYear(), target.getMonth(), target.getDate(), e.allDay ? 0 : s.getHours(), e.allDay ? 0 : s.getMinutes());
    start(async () => {
      const r = await moveEvent(e.id, next.toISOString());
      setMessage(r.ok ? `Moved "${e.title}" to ${target.toLocaleDateString()}.` : r.message);
      if (r.ok) router.refresh();
    });
  };
  const dragProps = (key: string) => ({
    onDragOver: (ev: React.DragEvent) => { if (dragging?.draggable) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (over !== key) setOver(key); } },
    onDragLeave: () => { if (over === key) setOver(null); },
    onDrop: (ev: React.DragEvent) => { ev.preventDefault(); drop(key); },
  });

  const cells: DayCell[][] = view === "month" ? monthGrid(anchor) : [weekDays(anchor)];
  const byDay = bucketEvents(events, cells);

  return (
    <div>
      {message && <p className="mb-2 rounded-md bg-accentSoft px-3 py-1.5 text-sm text-accent" role="status">{message} <button className="ml-2 underline" onClick={() => setMessage(null)}>Dismiss</button></p>}
      {pending && <p className="mb-2 text-xs text-neutral-500">Saving…</p>}

      {view === "month" ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-neutral-50 text-center text-xs font-semibold text-neutral-600">{WEEKDAY_SHORT.map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
          {cells.map((row, r) => (
            <div key={r} className="grid grid-cols-7 border-b border-line last:border-b-0">
              {row.map((c) => {
                const list = byDay[c.key] ?? [];
                const isExp = expanded === c.key;
                const shown = isExp ? list : list.slice(0, 3);
                return (
                  <div key={c.key} {...dragProps(c.key)} onClick={() => setNewDay(c.key)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setNewDay(c.key); }} aria-label={`${c.date.toLocaleDateString()}: ${list.length} event${list.length === 1 ? "" : "s"}. Add an event`}
                    className={`min-h-[6.5rem] border-r border-line p-1 last:border-r-0 ${c.inMonth ? "" : "bg-neutral-50 text-neutral-400"} ${over === c.key ? "ring-2 ring-inset ring-accent" : ""}`}>
                    <div className="mb-1 flex items-center justify-between text-xs"><span className={`grid h-5 w-5 place-items-center rounded-full ${today === c.key ? "bg-accent font-semibold text-white" : ""}`}>{c.date.getDate()}</span></div>
                    <div className="space-y-0.5">
                      {shown.map((e) => <Chip key={e.id} e={e} clients={clients} onOpen={setOpen} onDragStart={setDragging} />)}
                      {list.length > 3 && !isExp && <button type="button" className="text-[11px] text-neutral-500 hover:underline" onClick={(ev) => { ev.stopPropagation(); setExpanded(c.key); }}>+{list.length - 3} more</button>}
                      {isExp && <button type="button" className="text-[11px] text-neutral-500 hover:underline" onClick={(ev) => { ev.stopPropagation(); setExpanded(null); }}>Show less</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[52rem] grid-cols-[3.5rem_repeat(7,1fr)]">
            <div className="border-b border-r border-line bg-neutral-50" />
            {cells[0].map((c) => <div key={c.key} className="border-b border-r border-line bg-neutral-50 py-1.5 text-center text-xs font-semibold text-neutral-600 last:border-r-0">{WEEKDAY_SHORT[c.dow]} <span className={`ml-1 inline-grid h-5 w-5 place-items-center rounded-full ${today === c.key ? "bg-accent text-white" : ""}`}>{c.date.getDate()}</span></div>)}
            <div className="border-b border-r border-line px-1 py-1 text-[10px] text-neutral-500">All day</div>
            {cells[0].map((c) => {
              const list = (byDay[c.key] ?? []).filter((e) => e.allDay);
              return (
                <div key={c.key} {...dragProps(c.key)} onClick={() => setNewDay(c.key)} className={`min-h-[2.5rem] space-y-0.5 border-b border-r border-line p-1 last:border-r-0 ${over === c.key ? "ring-2 ring-inset ring-accent" : ""}`}>
                  {list.map((e) => <Chip key={e.id} e={e} clients={clients} onOpen={setOpen} onDragStart={setDragging} />)}
                </div>
              );
            })}
            <div className="relative border-r border-line" style={{ height: HOURS.length * HOUR_PX }}>
              {HOURS.map((h, i) => <div key={h} className="absolute right-1 text-[10px] text-neutral-500" style={{ top: i * HOUR_PX - 6 }}>{h > 12 ? `${h - 12} pm` : h === 12 ? "12 pm" : `${h} am`}</div>)}
            </div>
            {cells[0].map((c) => {
              const timed = (byDay[c.key] ?? []).filter((e) => !e.allDay);
              return (
                <div key={c.key} {...dragProps(c.key)} onClick={() => setNewDay(c.key)} className={`relative border-r border-line last:border-r-0 ${over === c.key ? "ring-2 ring-inset ring-accent" : ""}`} style={{ height: HOURS.length * HOUR_PX }}>
                  {HOURS.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: i * HOUR_PX }} />)}
                  {timed.map((e, i) => {
                    const s = new Date(e.startsAt);
                    const en = e.endsAt ? new Date(e.endsAt) : new Date(s.getTime() + 36e5);
                    const sameDay = localYmd(s) === c.key;
                    const startH = sameDay ? s.getHours() + s.getMinutes() / 60 : 7;
                    const endH = localYmd(en) === c.key ? en.getHours() + en.getMinutes() / 60 : 21;
                    const top = Math.max(0, (Math.min(Math.max(startH, 7), 21) - 7) * HOUR_PX);
                    const height = Math.max(22, (Math.min(Math.max(endH, 7), 21) - Math.min(Math.max(startH, 7), 21)) * HOUR_PX);
                    return <div key={e.id} className="absolute left-0.5 right-0.5" style={{ top, height, zIndex: 2 + i }}><div className="h-full overflow-hidden rounded" style={{ background: colorOf(e, clients) + "18" }}><Chip e={e} clients={clients} onOpen={setOpen} onDragStart={setDragging} timed /></div></div>;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-neutral-500">Click a day to add an event. Drag an event to another day to move it. Dashed items come from releases, deadlines and interviews.</p>

      {newDay && <Popover onClose={() => setNewDay(null)} title={`New event on ${parseYmd(newDay).toLocaleDateString()}`}><EventForm day={newDay} clients={clients} onDone={() => setNewDay(null)} /></Popover>}
      {open && <Popover onClose={() => setOpen(null)} title={open.virtual ? "Linked item" : "Edit event"}>{open.virtual ? <VirtualEventCard event={open} onDone={() => setOpen(null)} /> : <EventForm event={open} clients={clients} onDone={() => setOpen(null)} />}</Popover>}
    </div>
  );
}
