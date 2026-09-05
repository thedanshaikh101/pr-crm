"use server";
// Response Desk server actions: topics, themes, conversations, interviews, statements, activities, attachments.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { cleanHtml, stripTags } from "@/lib/html";
import { nextVersion, bodyChanged } from "@/lib/responseDesk/statements";
import { humanize, proposedTimesOf } from "@/lib/responseDesk/labels";

// ------------------------------------------------------------ helpers

const RD = "/response-desk";
function rev(...paths: string[]) {
  revalidatePath(RD, "layout");
  revalidatePath("/dashboard");
  for (const p of paths) revalidatePath(p);
}
const opt = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
function dateOrNull(s: unknown) {
  if (typeof s !== "string" || !s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const Status = {
  topic: z.enum(["OPEN", "MONITORING", "CLOSED"]),
  conversation: z.enum(["NEW", "IN_PROGRESS", "RESPONDED", "CLOSED"]),
  channel: z.enum(["EMAIL", "PHONE", "SOCIAL", "OTHER"]),
  format: z.enum(["LIVE", "PRE_RECORD", "PHONE", "IN_PERSON"]),
  interview: z.enum(["REQUESTED", "PROPOSED", "CONFIRMED", "COMPLETED", "DECLINED", "CANCELLED"]),
  kind: z.enum(["TASK", "CALL", "EMAIL", "MEETING"]),
};
type Viewer = Awaited<ReturnType<typeof requireViewer>>;

async function writer() {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  return v;
}
async function memberOrNull(v: Viewer, userId: string | null) {
  if (!userId) return null;
  const m = await db.membership.findFirst({ where: { accountId: v.account.id, userId, deactivatedAt: null }, select: { userId: true } });
  return m ? userId : null;
}
async function contactOrNull(v: Viewer, id: string | null) {
  if (!id) return null;
  const c = await db.contact.findFirst({ where: { id, accountId: v.account.id, deletedAt: null }, select: { id: true } });
  return c ? id : null;
}
async function topicOrNull(v: Viewer, id: string | null) {
  if (!id) return null;
  const t = await db.topic.findFirst({ where: { id, accountId: v.account.id }, select: { id: true } });
  return t ? id : null;
}
async function themeOrNull(v: Viewer, id: string | null) {
  if (!id) return null;
  const t = await db.theme.findFirst({ where: { id, accountId: v.account.id }, select: { id: true } });
  return t ? id : null;
}

// ------------------------------------------------------------ themes

const ThemeInput = z.object({ name: z.string().trim().min(1, "Name is required"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1F5FBF") });

export async function createTheme(form: FormData) {
  const v = await writer();
  const d = ThemeInput.parse(Object.fromEntries(form));
  const t = await db.theme.upsert({ where: { accountId_name: { accountId: v.account.id, name: d.name } }, create: { accountId: v.account.id, name: d.name, color: d.color }, update: { color: d.color } });
  await audit(v.account.id, v.user.id, "theme.create", "theme", t.id, { name: d.name });
  rev();
}

export async function updateTheme(id: string, form: FormData) {
  const v = await writer();
  const d = ThemeInput.parse(Object.fromEntries(form));
  const r = await db.theme.updateMany({ where: { id, accountId: v.account.id }, data: { name: d.name, color: d.color } });
  if (!r.count) throw new Error("Theme not found");
  await audit(v.account.id, v.user.id, "theme.update", "theme", id, { name: d.name, color: d.color });
  rev();
  redirect(`${RD}/themes`);
}

export async function deleteTheme(id: string) {
  const v = await writer();
  const topics = await db.topic.count({ where: { accountId: v.account.id, themeId: id } });
  if (topics) redirect(`${RD}/themes?error=${encodeURIComponent(`This theme is used by ${topics} topic${topics === 1 ? "" : "s"}. Move them to another theme first.`)}`);
  await db.theme.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "theme.delete", "theme", id);
  rev();
  redirect(`${RD}/themes`);
}

// ------------------------------------------------------------ topics

const TopicInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  themeId: z.string().optional(),
  topicType: z.string().optional(),
  status: Status.topic.optional(),
  ownerId: z.string().optional(),
  description: z.string().optional(),
});

async function topicData(v: Viewer, d: z.infer<typeof TopicInput>) {
  return {
    name: d.name,
    themeId: await themeOrNull(v, opt(d.themeId)),
    topicType: opt(d.topicType),
    status: d.status ?? "OPEN",
    ownerId: await memberOrNull(v, opt(d.ownerId)),
    description: d.description ? cleanHtml(d.description) : null,
  };
}

export async function createTopic(form: FormData) {
  const v = await writer();
  const d = TopicInput.parse(Object.fromEntries(form));
  const t = await db.topic.create({ data: { accountId: v.account.id, ...(await topicData(v, d)) } });
  await audit(v.account.id, v.user.id, "topic.create", "topic", t.id, { name: t.name });
  rev();
  redirect(`${RD}/topics/${t.id}`);
}

export async function updateTopic(id: string, form: FormData) {
  const v = await writer();
  const d = TopicInput.parse(Object.fromEntries(form));
  const r = await db.topic.updateMany({ where: { id, accountId: v.account.id }, data: await topicData(v, d) });
  if (!r.count) throw new Error("Topic not found");
  await audit(v.account.id, v.user.id, "topic.update", "topic", id, { name: d.name });
  rev();
  redirect(`${RD}/topics/${id}`);
}

export async function setTopicStatus(id: string, status: "OPEN" | "MONITORING" | "CLOSED") {
  const v = await writer();
  const r = await db.topic.updateMany({ where: { id, accountId: v.account.id }, data: { status: Status.topic.parse(status) } });
  if (!r.count) throw new Error("Topic not found");
  await audit(v.account.id, v.user.id, "topic.status", "topic", id, { status });
  rev();
}

export async function deleteTopic(id: string) {
  const v = await writer();
  const [conversations, statements] = await Promise.all([
    db.conversation.count({ where: { accountId: v.account.id, topicId: id } }),
    db.statement.count({ where: { accountId: v.account.id, topicId: id } }),
  ]);
  if (conversations || statements) redirect(`${RD}/topics/${id}?error=${encodeURIComponent("Unlink its conversations and statements before deleting this topic.")}`);
  await db.attachment.deleteMany({ where: { accountId: v.account.id, entity: "topic", entityId: id } });
  await db.activity.deleteMany({ where: { accountId: v.account.id, entity: "topic", entityId: id } });
  await db.topic.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "topic.delete", "topic", id);
  rev();
  redirect(`${RD}/topics`);
}

// ------------------------------------------------------------ conversations

const ConversationInput = z.object({
  contactId: z.string().optional(),
  outletName: z.string().optional(),
  channel: Status.channel.default("EMAIL"),
  caseType: z.string().optional(),
  receivedAt: z.string().optional(),
  deadline: z.string().optional(),
  question: z.string().trim().min(1, "Question is required"),
  assigneeId: z.string().optional(),
  topicId: z.string().optional(),
});

async function conversationData(v: Viewer, d: z.infer<typeof ConversationInput>) {
  return {
    contactId: await contactOrNull(v, opt(d.contactId)),
    outletName: opt(d.outletName),
    channel: d.channel,
    caseType: opt(d.caseType),
    receivedAt: dateOrNull(d.receivedAt) ?? new Date(),
    deadline: dateOrNull(d.deadline),
    question: d.question,
    assigneeId: await memberOrNull(v, opt(d.assigneeId)),
    topicId: await topicOrNull(v, opt(d.topicId)),
  };
}

async function ownConversation(v: Viewer, id: string) {
  const c = await db.conversation.findFirst({ where: { id, accountId: v.account.id } });
  if (!c) throw new Error("Conversation not found");
  return c;
}

async function statusNote(conversationId: string, authorId: string, status: string, extra?: string) {
  await db.conversationNote.create({ data: { conversationId, authorId, body: `[status] ${humanize(status)}${extra ? ` (${extra})` : ""}` } });
}

export async function createConversation(form: FormData) {
  const v = await writer();
  const d = ConversationInput.parse(Object.fromEntries(form));
  const data = await conversationData(v, d);
  if (!data.outletName && data.contactId) {
    const c = await db.contact.findFirst({ where: { id: data.contactId, accountId: v.account.id }, select: { organization: { select: { name: true } } } });
    data.outletName = c?.organization?.name ?? null;
  }
  const c = await db.conversation.create({ data: { accountId: v.account.id, ...data, status: "NEW" } });
  await audit(v.account.id, v.user.id, "conversation.create", "conversation", c.id, { outletName: c.outletName });
  rev();
  redirect(`${RD}/conversations/${c.id}`);
}

export async function updateConversation(id: string, form: FormData) {
  const v = await writer();
  await ownConversation(v, id);
  const raw = Object.fromEntries(form);
  const d = ConversationInput.partial().parse(raw);
  const patch: Record<string, unknown> = {};
  if ("contactId" in raw) patch.contactId = await contactOrNull(v, opt(d.contactId));
  if ("outletName" in raw) patch.outletName = opt(d.outletName);
  if ("channel" in raw && d.channel) patch.channel = d.channel;
  if ("caseType" in raw) patch.caseType = opt(d.caseType);
  if ("receivedAt" in raw) patch.receivedAt = dateOrNull(d.receivedAt) ?? new Date();
  if ("deadline" in raw) patch.deadline = dateOrNull(d.deadline);
  if ("question" in raw && d.question) patch.question = d.question;
  if ("assigneeId" in raw) patch.assigneeId = await memberOrNull(v, opt(d.assigneeId));
  if ("topicId" in raw) patch.topicId = await topicOrNull(v, opt(d.topicId));
  await db.conversation.updateMany({ where: { id, accountId: v.account.id }, data: patch });
  await audit(v.account.id, v.user.id, "conversation.update", "conversation", id, { fields: Object.keys(patch) });
  rev(`${RD}/conversations/${id}`);
  if (raw.redirectTo === "detail") redirect(`${RD}/conversations/${id}`);
}

export async function setConversationStatus(id: string, status: "NEW" | "IN_PROGRESS" | "RESPONDED" | "CLOSED") {
  const v = await writer();
  const c = await ownConversation(v, id);
  const next = Status.conversation.parse(status);
  if (c.status === next) return;
  await db.conversation.updateMany({ where: { id, accountId: v.account.id }, data: { status: next } });
  await statusNote(id, v.user.id, next, `was ${humanize(c.status)}`);
  await audit(v.account.id, v.user.id, "conversation.status", "conversation", id, { from: c.status, to: next });
  rev(`${RD}/conversations/${id}`);
}

export async function saveReply(id: string, form: FormData) {
  const v = await writer();
  const c = await ownConversation(v, id);
  const html = cleanHtml(String(form.get("replySent") ?? ""));
  const hasText = stripTags(html).length > 0;
  const patch: Record<string, unknown> = { replySent: hasText ? html : null };
  let moved = false;
  if (hasText && !c.repliedAt) patch.repliedAt = new Date();
  if (hasText && (c.status === "NEW" || c.status === "IN_PROGRESS")) { patch.status = "RESPONDED"; moved = true; }
  await db.conversation.updateMany({ where: { id, accountId: v.account.id }, data: patch });
  if (moved) await statusNote(id, v.user.id, "RESPONDED", "reply saved");
  await audit(v.account.id, v.user.id, "conversation.reply", "conversation", id, { moved });
  rev(`${RD}/conversations/${id}`);
}

export async function addConversationNote(id: string, form: FormData) {
  const v = await writer();
  await ownConversation(v, id);
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  const n = await db.conversationNote.create({ data: { conversationId: id, authorId: v.user.id, body } });
  await audit(v.account.id, v.user.id, "conversation.note", "conversation", id, { noteId: n.id });
  rev(`${RD}/conversations/${id}`);
}

export async function deleteConversationNote(noteId: string) {
  const v = await writer();
  const n = await db.conversationNote.findFirst({ where: { id: noteId, conversation: { accountId: v.account.id } }, select: { id: true, authorId: true, conversationId: true } });
  if (!n) throw new Error("Note not found");
  if (n.authorId !== v.user.id) requireRole(v, "ADMIN");
  await db.conversationNote.delete({ where: { id: noteId } });
  await audit(v.account.id, v.user.id, "conversation.note_delete", "conversation", n.conversationId, { noteId });
  rev(`${RD}/conversations/${n.conversationId}`);
}

export async function deleteConversation(id: string) {
  const v = await writer();
  await ownConversation(v, id);
  await db.attachment.deleteMany({ where: { accountId: v.account.id, entity: "conversation", entityId: id } });
  await db.activity.deleteMany({ where: { accountId: v.account.id, entity: "conversation", entityId: id } });
  await db.conversation.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "conversation.delete", "conversation", id);
  rev();
  redirect(`${RD}/conversations`);
}

// ------------------------------------------------------------ attachments

const AttachInput = z.object({ entity: z.enum(["conversation", "statement", "topic", "interview"]), entityId: z.string().min(1), assetId: z.string().min(1), returnTo: z.string().optional() });

async function entityExists(v: Viewer, entity: string, entityId: string) {
  const where = { id: entityId, accountId: v.account.id };
  switch (entity) {
    case "conversation": return !!(await db.conversation.findFirst({ where, select: { id: true } }));
    case "statement": return !!(await db.statement.findFirst({ where, select: { id: true } }));
    case "topic": return !!(await db.topic.findFirst({ where, select: { id: true } }));
    case "interview": return !!(await db.interviewRequest.findFirst({ where, select: { id: true } }));
    default: return false;
  }
}

export async function attachAsset(form: FormData) {
  const v = await writer();
  const d = AttachInput.parse(Object.fromEntries(form));
  const asset = await db.asset.findFirst({ where: { id: d.assetId, accountId: v.account.id, deletedAt: null }, select: { id: true } });
  if (!asset) throw new Error("Asset not found");
  if (!(await entityExists(v, d.entity, d.entityId))) throw new Error("Record not found");
  const dup = await db.attachment.findFirst({ where: { accountId: v.account.id, entity: d.entity, entityId: d.entityId, assetId: d.assetId } });
  if (!dup) {
    const a = await db.attachment.create({ data: { accountId: v.account.id, assetId: d.assetId, entity: d.entity, entityId: d.entityId, conversationId: d.entity === "conversation" ? d.entityId : null } });
    await audit(v.account.id, v.user.id, "attachment.create", "attachment", a.id, { entity: d.entity, entityId: d.entityId });
  }
  rev();
  if (d.returnTo?.startsWith("/")) redirect(d.returnTo);
}

export async function detachAsset(attachmentId: string, returnTo?: string) {
  const v = await writer();
  const a = await db.attachment.findFirst({ where: { id: attachmentId, accountId: v.account.id } });
  if (!a) throw new Error("Attachment not found");
  await db.attachment.delete({ where: { id: attachmentId } });
  await audit(v.account.id, v.user.id, "attachment.delete", "attachment", attachmentId, { entity: a.entity, entityId: a.entityId });
  rev();
  if (returnTo?.startsWith("/")) redirect(returnTo);
}

// ------------------------------------------------------------ interview requests

const InterviewInput = z.object({
  contactId: z.string().optional(),
  outletName: z.string().optional(),
  spokesperson: z.string().trim().min(1, "Spokesperson is required"),
  format: Status.format.default("PHONE"),
  status: Status.interview.optional(),
  outcome: z.string().optional(),
});

function timesFromForm(form: FormData) {
  const raw = [...form.getAll("proposedTimes[]"), ...form.getAll("proposedTimes")].map(String);
  const iso = raw.map((s) => dateOrNull(s)).filter((d): d is Date => !!d).map((d) => d.toISOString());
  return Array.from(new Set(iso)).sort();
}

async function ownInterview(v: Viewer, id: string) {
  const i = await db.interviewRequest.findFirst({ where: { id, accountId: v.account.id } });
  if (!i) throw new Error("Interview request not found");
  return i;
}

async function syncInterviewEvent(v: Viewer, i: { id: string; spokesperson: string; outletName: string | null; confirmedAt: Date | null }) {
  const existing = await db.calendarEvent.findFirst({ where: { accountId: v.account.id, kind: "INTERVIEW", entityId: i.id } });
  if (!i.confirmedAt) { if (existing) await db.calendarEvent.deleteMany({ where: { accountId: v.account.id, kind: "INTERVIEW", entityId: i.id } }); return; }
  const data = { title: `Interview: ${i.spokesperson} with ${i.outletName ?? "outlet"}`, startsAt: i.confirmedAt, endsAt: new Date(i.confirmedAt.getTime() + 36e5), allDay: false, clientId: null };
  if (existing) await db.calendarEvent.update({ where: { id: existing.id }, data });
  else await db.calendarEvent.create({ data: { accountId: v.account.id, kind: "INTERVIEW", entityId: i.id, ...data } });
}

export async function createInterview(form: FormData) {
  const v = await writer();
  const d = InterviewInput.parse(Object.fromEntries(form));
  const proposedTimes = timesFromForm(form);
  const i = await db.interviewRequest.create({ data: {
    accountId: v.account.id, contactId: await contactOrNull(v, opt(d.contactId)), outletName: opt(d.outletName), spokesperson: d.spokesperson, format: d.format,
    proposedTimes, status: d.status ?? (proposedTimes.length ? "PROPOSED" : "REQUESTED"), outcome: opt(d.outcome),
  } });
  await audit(v.account.id, v.user.id, "interview.create", "interview", i.id, { spokesperson: i.spokesperson });
  rev();
  redirect(`${RD}/interviews/${i.id}`);
}

export async function updateInterview(id: string, form: FormData) {
  const v = await writer();
  const cur = await ownInterview(v, id);
  const d = InterviewInput.parse(Object.fromEntries(form));
  const proposedTimes = timesFromForm(form);
  const status = d.status ?? cur.status;
  const confirmedAt = status === "CONFIRMED" ? cur.confirmedAt : status === "CANCELLED" || status === "DECLINED" ? null : cur.confirmedAt;
  await db.interviewRequest.updateMany({ where: { id, accountId: v.account.id }, data: {
    contactId: await contactOrNull(v, opt(d.contactId)), outletName: opt(d.outletName), spokesperson: d.spokesperson, format: d.format, proposedTimes, status, outcome: opt(d.outcome), confirmedAt,
  } });
  await syncInterviewEvent(v, { id, spokesperson: d.spokesperson, outletName: opt(d.outletName), confirmedAt: status === "CONFIRMED" ? confirmedAt : null });
  await audit(v.account.id, v.user.id, "interview.update", "interview", id, { status });
  rev(`${RD}/interviews/${id}`);
  redirect(`${RD}/interviews/${id}`);
}

export async function proposeInterview(id: string) {
  const v = await writer();
  await ownInterview(v, id);
  await db.interviewRequest.updateMany({ where: { id, accountId: v.account.id }, data: { status: "PROPOSED" } });
  await audit(v.account.id, v.user.id, "interview.status", "interview", id, { status: "PROPOSED" });
  rev(`${RD}/interviews/${id}`);
}

export async function confirmInterview(id: string, form: FormData) {
  const v = await writer();
  const i = await ownInterview(v, id);
  const time = dateOrNull(String(form.get("time") ?? ""));
  if (!time) throw new Error("Pick a time to confirm");
  const times = proposedTimesOf(i.proposedTimes);
  if (!times.includes(time.toISOString())) times.push(time.toISOString());
  await db.interviewRequest.updateMany({ where: { id, accountId: v.account.id }, data: { confirmedAt: time, status: "CONFIRMED", proposedTimes: times.sort() } });
  await syncInterviewEvent(v, { id, spokesperson: i.spokesperson, outletName: i.outletName, confirmedAt: time });
  await audit(v.account.id, v.user.id, "interview.confirm", "interview", id, { confirmedAt: time.toISOString() });
  rev(`${RD}/interviews/${id}`, "/planning/calendar");
}

export async function completeInterview(id: string, form: FormData) {
  const v = await writer();
  await ownInterview(v, id);
  await db.interviewRequest.updateMany({ where: { id, accountId: v.account.id }, data: { status: "COMPLETED", outcome: opt(form.get("outcome")) } });
  await audit(v.account.id, v.user.id, "interview.complete", "interview", id);
  rev(`${RD}/interviews/${id}`);
}

async function endInterview(id: string, status: "DECLINED" | "CANCELLED") {
  const v = await writer();
  await ownInterview(v, id);
  await db.interviewRequest.updateMany({ where: { id, accountId: v.account.id }, data: { status } });
  await db.calendarEvent.deleteMany({ where: { accountId: v.account.id, kind: "INTERVIEW", entityId: id } });
  await audit(v.account.id, v.user.id, "interview.status", "interview", id, { status });
  rev(`${RD}/interviews/${id}`, "/planning/calendar");
}
export async function declineInterview(id: string) { await endInterview(id, "DECLINED"); }
export async function cancelInterview(id: string) { await endInterview(id, "CANCELLED"); }

export async function deleteInterview(id: string) {
  const v = await writer();
  await ownInterview(v, id);
  await db.calendarEvent.deleteMany({ where: { accountId: v.account.id, kind: "INTERVIEW", entityId: id } });
  await db.attachment.deleteMany({ where: { accountId: v.account.id, entity: "interview", entityId: id } });
  await db.activity.deleteMany({ where: { accountId: v.account.id, entity: "interview", entityId: id } });
  await db.interviewRequest.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "interview.delete", "interview", id);
  rev();
  redirect(`${RD}/interviews`);
}

// ------------------------------------------------------------ statements

const StatementInput = z.object({ title: z.string().trim().min(1, "Title is required"), topicId: z.string().optional(), body: z.string().optional(), expiresAt: z.string().optional() });

async function ownStatement(v: Viewer, id: string) {
  const s = await db.statement.findFirst({ where: { id, accountId: v.account.id }, include: { versions: { select: { version: true } } } });
  if (!s) throw new Error("Statement not found");
  return s;
}

export async function createStatement(form: FormData) {
  const v = await writer();
  const d = StatementInput.parse(Object.fromEntries(form));
  const body = cleanHtml(d.body ?? "");
  const s = await db.statement.create({ data: {
    accountId: v.account.id, title: d.title, topicId: await topicOrNull(v, opt(d.topicId)), body, expiresAt: dateOrNull(d.expiresAt), status: "DRAFT",
    versions: { create: { version: 1, body, savedById: v.user.id } },
  } });
  await audit(v.account.id, v.user.id, "statement.create", "statement", s.id, { title: s.title });
  rev();
  redirect(`${RD}/statements/${s.id}`);
}

export async function updateStatement(id: string, form: FormData) {
  const v = await writer();
  const s = await ownStatement(v, id);
  const d = StatementInput.parse(Object.fromEntries(form));
  const body = cleanHtml(d.body ?? "");
  const changed = bodyChanged(s.body, body);
  const patch: Record<string, unknown> = { title: d.title, topicId: await topicOrNull(v, opt(d.topicId)), expiresAt: dateOrNull(d.expiresAt) };
  if (changed) {
    patch.body = body;
    // Approval covers a specific text; editing an approved statement sends it back to draft.
    if (s.status === "APPROVED") { patch.status = "DRAFT"; patch.approvedById = null; patch.approvedAt = null; }
  }
  await db.statement.updateMany({ where: { id, accountId: v.account.id }, data: patch });
  let version: number | null = null;
  if (changed) {
    version = nextVersion(s.versions);
    await db.statementVersion.create({ data: { statementId: id, version, body, savedById: v.user.id } });
  }
  await audit(v.account.id, v.user.id, "statement.update", "statement", id, { version });
  rev(`${RD}/statements/${id}`);
  redirect(`${RD}/statements/${id}`);
}

export async function restoreStatementVersion(id: string, version: number) {
  const v = await writer();
  const s = await ownStatement(v, id);
  const old = await db.statementVersion.findUnique({ where: { statementId_version: { statementId: id, version } } });
  if (!old) throw new Error("Version not found");
  const n = nextVersion(s.versions);
  await db.statementVersion.create({ data: { statementId: id, version: n, body: old.body, savedById: v.user.id } });
  const patch: Record<string, unknown> = { body: old.body };
  if (s.status === "APPROVED" && bodyChanged(s.body, old.body)) { patch.status = "DRAFT"; patch.approvedById = null; patch.approvedAt = null; }
  await db.statement.updateMany({ where: { id, accountId: v.account.id }, data: patch });
  await audit(v.account.id, v.user.id, "statement.restore", "statement", id, { from: version, version: n });
  rev(`${RD}/statements/${id}`);
  redirect(`${RD}/statements/${id}`);
}

async function setStatementStatus(id: string, status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "EXPIRED", minRole: "EDITOR" | "ADMIN" = "EDITOR") {
  const v = await writer();
  requireRole(v, minRole);
  await ownStatement(v, id);
  const data: Record<string, unknown> = { status };
  if (status === "APPROVED") { data.approvedById = v.user.id; data.approvedAt = new Date(); }
  if (status === "DRAFT") { data.approvedById = null; data.approvedAt = null; }
  await db.statement.updateMany({ where: { id, accountId: v.account.id }, data });
  await audit(v.account.id, v.user.id, `statement.${status.toLowerCase()}`, "statement", id, { status });
  rev(`${RD}/statements/${id}`);
}
export async function submitStatement(id: string) { await setStatementStatus(id, "IN_REVIEW"); }
export async function approveStatement(id: string) { await setStatementStatus(id, "APPROVED", "ADMIN"); }
export async function statementToDraft(id: string) { await setStatementStatus(id, "DRAFT"); }
export async function expireStatement(id: string) { await setStatementStatus(id, "EXPIRED"); }

export async function deleteStatement(id: string) {
  const v = await writer();
  await ownStatement(v, id);
  await db.attachment.deleteMany({ where: { accountId: v.account.id, entity: "statement", entityId: id } });
  await db.activity.deleteMany({ where: { accountId: v.account.id, entity: "statement", entityId: id } });
  await db.statement.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "statement.delete", "statement", id);
  rev();
  redirect(`${RD}/statements`);
}

// ------------------------------------------------------------ activities

const ActivityInput = z.object({
  title: z.string().trim().min(1, "Title is required"),
  kind: Status.kind.default("TASK"),
  body: z.string().optional(),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  returnTo: z.string().optional(),
});

export async function createActivity(form: FormData) {
  const v = await writer();
  const d = ActivityInput.parse(Object.fromEntries(form));
  const entity = opt(d.entity), entityId = opt(d.entityId);
  const a = await db.activity.create({ data: {
    accountId: v.account.id, kind: d.kind, title: d.title, body: opt(d.body), assigneeId: (await memberOrNull(v, opt(d.assigneeId))) ?? v.user.id, dueAt: dateOrNull(d.dueAt),
    entity: entity && entityId ? entity : null, entityId: entity && entityId ? entityId : null, createdById: v.user.id,
  } });
  await audit(v.account.id, v.user.id, "activity.create", "activity", a.id, { kind: a.kind, entity, entityId });
  rev();
  if (d.returnTo?.startsWith("/")) redirect(d.returnTo);
}

export async function updateActivity(id: string, form: FormData) {
  const v = await writer();
  const d = ActivityInput.parse(Object.fromEntries(form));
  const entity = opt(d.entity), entityId = opt(d.entityId);
  const r = await db.activity.updateMany({ where: { id, accountId: v.account.id }, data: {
    kind: d.kind, title: d.title, body: opt(d.body), assigneeId: await memberOrNull(v, opt(d.assigneeId)), dueAt: dateOrNull(d.dueAt),
    entity: entity && entityId ? entity : null, entityId: entity && entityId ? entityId : null,
  } });
  if (!r.count) throw new Error("Activity not found");
  await audit(v.account.id, v.user.id, "activity.update", "activity", id);
  rev();
  redirect(d.returnTo?.startsWith("/") ? d.returnTo : `${RD}/activities`);
}

export async function toggleActivity(id: string) {
  const v = await writer();
  const a = await db.activity.findFirst({ where: { id, accountId: v.account.id }, select: { completedAt: true } });
  if (!a) throw new Error("Activity not found");
  await db.activity.updateMany({ where: { id, accountId: v.account.id }, data: { completedAt: a.completedAt ? null : new Date() } });
  await audit(v.account.id, v.user.id, a.completedAt ? "activity.reopen" : "activity.complete", "activity", id);
  rev();
}

export async function deleteActivity(id: string) {
  const v = await writer();
  const r = await db.activity.deleteMany({ where: { id, accountId: v.account.id } });
  if (!r.count) throw new Error("Activity not found");
  await audit(v.account.id, v.user.id, "activity.delete", "activity", id);
  rev();
}
