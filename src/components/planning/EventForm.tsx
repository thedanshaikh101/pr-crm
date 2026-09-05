"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createEvent, deleteEvent, updateEvent } from "@/server/planning";
import { KINDS, KIND_LABEL } from "@/lib/planning/calendar";

export type CalEvent = {
  id: string; title: string; kind: string; startsAt: string; endsAt: string | null; allDay: boolean; color: string | null;
  clientId: string | null; clientName: string | null; virtual: boolean; draggable: boolean; href?: string | null; note?: string | null;
};
export type ClientOpt = { id: string; name: string; color: string };

const pad = (n: number) => String(n).padStart(2, "0");
export const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localHm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function EventForm({ event, day, clients, onDone }: { event?: CalEvent | null; day?: string; clients: ClientOpt[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const s = event ? new Date(event.startsAt) : null;
  const e = event?.endsAt ? new Date(event.endsAt) : null;
  const [allDay, setAllDay] = useState(event ? event.allDay : true);
  const [customColor, setCustomColor] = useState(!!event?.color);
  const submit = (fd: FormData) => start(async () => {
    setError(null);
    try { if (event) await updateEvent(event.id, fd); else await createEvent(fd); onDone(); router.refresh(); }
    catch (err) { setError((err as Error).message || "Could not save the event."); }
  });
  return (
    <form action={submit} className="grid gap-2 text-sm">
      {error && <p className="text-xs text-bad" role="alert">{error}</p>}
      <div><label className="label" htmlFor="ev-title">Title</label><input id="ev-title" name="title" className="input" defaultValue={event?.title ?? ""} required autoFocus /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="ev-kind">Kind</label><select id="ev-kind" name="kind" className="input" defaultValue={event?.kind ?? "OTHER"}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
        <div><label className="label" htmlFor="ev-client">Client</label><select id="ev-client" name="clientId" className="input" defaultValue={event?.clientId ?? ""}><option value="">No client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" name="allDay" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} /> All day</label>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="ev-start">Start</label><input id="ev-start" type="date" name="startDate" className="input" defaultValue={s ? localYmd(s) : day ?? localYmd(new Date())} required /></div>
        {!allDay && <div><label className="label" htmlFor="ev-start-time">Start time</label><input id="ev-start-time" type="time" name="startTime" className="input" defaultValue={s && !event?.allDay ? localHm(s) : "09:00"} /></div>}
        <div><label className="label" htmlFor="ev-end">End</label><input id="ev-end" type="date" name="endDate" className="input" defaultValue={e ? localYmd(e) : ""} /></div>
        {!allDay && <div><label className="label" htmlFor="ev-end-time">End time</label><input id="ev-end-time" type="time" name="endTime" className="input" defaultValue={e && !event?.allDay ? localHm(e) : "10:00"} /></div>}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={customColor} onChange={(ev) => setCustomColor(ev.target.checked)} /> Custom colour</label>
        <input type="color" name="color" aria-label="Event colour" className="h-8 w-12 cursor-pointer rounded border border-line disabled:opacity-40" defaultValue={event?.color ?? "#1F5FBF"} disabled={!customColor} />
        {!customColor && <span className="text-xs text-neutral-500">Uses the client colour</span>}
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn btn-primary" disabled={pending}>{event ? "Save" : "Add event"}</button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        {event && <button type="button" className="btn btn-danger ml-auto" disabled={pending} onClick={() => { if (confirm("Delete this event?")) start(async () => { await deleteEvent(event.id); onDone(); router.refresh(); }); }}>Delete</button>}
      </div>
    </form>
  );
}

/** Read-only popover body for virtual items (releases, deadlines, interviews). */
export function VirtualEventCard({ event, onDone }: { event: CalEvent; onDone: () => void }) {
  const s = new Date(event.startsAt);
  return (
    <div className="text-sm">
      <p className="font-medium">{event.title}</p>
      <p className="mt-1 text-xs text-neutral-600">{KIND_LABEL[event.kind] ?? event.kind} · {event.allDay ? s.toLocaleDateString() : s.toLocaleString()}{event.clientName ? ` · ${event.clientName}` : ""}</p>
      {event.note && <p className="mt-1 text-xs text-neutral-600">{event.note}</p>}
      <div className="mt-3 flex gap-2">
        {event.href && <Link href={event.href} className="btn btn-primary">Open</Link>}
        <button type="button" className="btn" onClick={onDone}>Close</button>
      </div>
    </div>
  );
}
