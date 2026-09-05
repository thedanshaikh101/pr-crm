"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { KINDS } from "@/lib/planning/calendar";
import { awarenessDaysFor } from "@/lib/planning/awarenessDays";

const EventInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  kind: z.enum(KINDS).default("OTHER"),
  clientId: z.string().trim().optional().transform((s) => s || null),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  startTime: z.string().trim().optional().transform((s) => s || null),
  endDate: z.string().trim().optional().transform((s) => s || null),
  endTime: z.string().trim().optional().transform((s) => s || null),
  allDay: z.preprocess((x) => x === "on" || x === "true" || x === true, z.boolean()).default(false),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")).transform((s) => s || null),
});

function combine(date: string, time: string | null, allDay: boolean) {
  const t = allDay || !time ? "00:00" : time;
  const d = new Date(`${date}T${t}:00`);
  if (isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}

function toData(d: z.infer<typeof EventInput>) {
  const startsAt = combine(d.startDate, d.startTime, d.allDay);
  let endsAt: Date | null = d.endDate ? combine(d.endDate, d.endTime ?? d.startTime, d.allDay) : null;
  if (endsAt && endsAt < startsAt) endsAt = null;
  return { title: d.title, kind: d.kind, clientId: d.clientId, startsAt, endsAt, allDay: d.allDay, color: d.color };
}

async function ownedClient(accountId: string, clientId: string | null) {
  if (!clientId) return null;
  const c = await db.client.findFirst({ where: { id: clientId, accountId }, select: { id: true } });
  return c?.id ?? null;
}

export async function createEvent(form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const d = EventInput.parse(Object.fromEntries(form));
  const data = toData(d);
  data.clientId = await ownedClient(v.account.id, data.clientId);
  const e = await db.calendarEvent.create({ data: { accountId: v.account.id, ...data } });
  await audit(v.account.id, v.user.id, "calendar.create", "calendarEvent", e.id, { title: e.title, kind: e.kind });
  revalidatePath("/planning/calendar");
}

export async function updateEvent(id: string, form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const d = EventInput.parse(Object.fromEntries(form));
  const data = toData(d);
  data.clientId = await ownedClient(v.account.id, data.clientId);
  const r = await db.calendarEvent.updateMany({ where: { id, accountId: v.account.id }, data });
  if (!r.count) throw new Error("Event not found");
  await audit(v.account.id, v.user.id, "calendar.update", "calendarEvent", id, { title: data.title });
  revalidatePath("/planning/calendar");
}

export async function deleteEvent(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  await db.calendarEvent.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "calendar.delete", "calendarEvent", id);
  revalidatePath("/planning/calendar");
}

export type MoveResult = { ok: true } | { ok: false; message: string };

/** Drag and drop. Real events move with their duration; "release:<id>" moves Release.scheduledFor when still DRAFT or SCHEDULED. */
export async function moveEvent(id: string, newStartIso: string): Promise<MoveResult> {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const newStart = new Date(newStartIso);
  if (isNaN(newStart.getTime())) return { ok: false, message: "Invalid date." };
  if (id.startsWith("release:")) {
    const releaseId = id.slice("release:".length);
    const r = await db.release.findFirst({ where: { id: releaseId, accountId: v.account.id, deletedAt: null }, select: { id: true, status: true, headline: true } });
    if (!r) return { ok: false, message: "Release not found." };
    if (r.status !== "SCHEDULED" && r.status !== "DRAFT") return { ok: false, message: `"${r.headline}" is ${r.status.toLowerCase()} and cannot be rescheduled from the calendar.` };
    await db.release.update({ where: { id: r.id }, data: { scheduledFor: newStart } });
    await db.calendarEvent.updateMany({ where: { accountId: v.account.id, kind: "RELEASE", entityId: r.id }, data: { startsAt: newStart } });
    await audit(v.account.id, v.user.id, "release.reschedule", "release", r.id, { scheduledFor: newStart.toISOString(), via: "calendar" });
    revalidatePath("/planning/calendar"); revalidatePath(`/releases/${r.id}`);
    return { ok: true };
  }
  if (id.includes(":")) return { ok: false, message: "Deadlines and interviews are moved from the Response Desk." };
  const e = await db.calendarEvent.findFirst({ where: { id, accountId: v.account.id } });
  if (!e) return { ok: false, message: "Event not found." };
  const delta = newStart.getTime() - e.startsAt.getTime();
  const endsAt = e.endsAt ? new Date(e.endsAt.getTime() + delta) : null;
  await db.calendarEvent.update({ where: { id: e.id }, data: { startsAt: newStart, endsAt } });
  if (e.kind === "RELEASE" && e.entityId) {
    const r = await db.release.findFirst({ where: { id: e.entityId, accountId: v.account.id }, select: { id: true, status: true } });
    if (r && (r.status === "SCHEDULED" || r.status === "DRAFT")) await db.release.update({ where: { id: r.id }, data: { scheduledFor: newStart } });
  }
  await audit(v.account.id, v.user.id, "calendar.move", "calendarEvent", e.id, { startsAt: newStart.toISOString() });
  revalidatePath("/planning/calendar");
  return { ok: true };
}

/** Creates AWARENESS_DAY events for the built-in list, skipping any already present by title and date. */
export async function importAwarenessDays(year: number): Promise<{ created: number; skipped: number }> {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const y = Math.round(Number(year));
  if (!Number.isFinite(y) || y < 2000 || y > 2100) throw new Error("Choose a year between 2000 and 2100");
  const days = awarenessDaysFor(y);
  const existing = await db.calendarEvent.findMany({ where: { accountId: v.account.id, kind: "AWARENESS_DAY", startsAt: { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) } }, select: { title: true, startsAt: true } });
  const key = (t: string, d: Date) => `${t.toLowerCase()}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const have = new Set(existing.map((e: any) => key(e.title, e.startsAt)));
  const fresh = days.filter((d) => !have.has(key(d.title, d.date)));
  if (fresh.length) await db.calendarEvent.createMany({ data: fresh.map((d) => ({ accountId: v.account.id, kind: "AWARENESS_DAY" as const, title: d.title, startsAt: d.date, allDay: true })) });
  await audit(v.account.id, v.user.id, "calendar.import_awareness", "calendarEvent", undefined, { year: y, created: fresh.length });
  revalidatePath("/planning/calendar");
  return { created: fresh.length, skipped: days.length - fresh.length };
}
