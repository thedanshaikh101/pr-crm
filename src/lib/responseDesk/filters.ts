// Conversation list filter state: URL <-> object <-> Prisma where. Pure; accountId is pinned first.
import { z } from "zod";

export const ConversationFilterSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "RESPONDED", "CLOSED"]).optional(),
  assignee: z.string().optional(),
  topic: z.string().optional(),
  channel: z.enum(["EMAIL", "PHONE", "SOCIAL", "OTHER"]).optional(),
  overdue: z.coerce.boolean().default(false),
  mine: z.coerce.boolean().default(false),
  open: z.coerce.boolean().default(false),
  sort: z.enum(["deadline", "received", "updated"]).default("deadline"),
  page: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().min(10).max(250).default(50),
  view: z.enum(["table", "cards"]).default("table"),
});
export type ConversationFilters = z.infer<typeof ConversationFilterSchema>;

export function parseConversationFilters(sp: Record<string, string | string[] | undefined>): ConversationFilters {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    const s = Array.isArray(v) ? v[0] : v;
    if (s === "") continue;
    obj[k] = s;
  }
  const r = ConversationFilterSchema.safeParse(obj);
  return r.success ? r.data : ConversationFilterSchema.parse({});
}

export function toConversationQuery(f: Partial<ConversationFilters>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (k === "page" && v === 1) continue;
    if (k === "per" && v === 50) continue;
    if (k === "sort" && v === "deadline") continue;
    if (k === "view" && v === "table") continue;
    p.set(k, v === true ? "1" : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function activeConversationFilterCount(f: ConversationFilters) {
  let n = 0;
  for (const k of ["status", "assignee", "topic", "channel"] as const) if (f[k]) n++;
  if (f.overdue) n++;
  if (f.mine) n++;
  if (f.open) n++;
  return n;
}

/** Prisma where for Conversation. accountId is always the first AND clause and cannot be overridden by URL state. */
export function buildConversationWhere(f: ConversationFilters, accountId: string, userId: string, now: Date = new Date()) {
  const and: any[] = [{ accountId }];
  if (f.q) {
    const q = f.q.trim();
    const ci = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ question: ci }, { outletName: ci }, { contact: { firstName: ci } }, { contact: { lastName: ci } }, { contact: { email: ci } }] });
  }
  if (f.status) and.push({ status: f.status });
  if (f.open) and.push({ status: { in: ["NEW", "IN_PROGRESS"] } });
  if (f.assignee) and.push({ assigneeId: f.assignee === "none" ? null : f.assignee });
  if (f.mine) and.push({ assigneeId: userId });
  if (f.topic) and.push({ topicId: f.topic === "none" ? null : f.topic });
  if (f.channel) and.push({ channel: f.channel });
  if (f.overdue) and.push({ deadline: { lt: now }, status: { notIn: ["RESPONDED", "CLOSED"] } });
  return { AND: and };
}

export function conversationOrder(sort: ConversationFilters["sort"]): any[] {
  if (sort === "received") return [{ receivedAt: "desc" }];
  if (sort === "updated") return [{ updatedAt: "desc" }];
  // Prisma puts nulls first on asc; sort by deadline asc with nulls last so the soonest deadlines lead.
  return [{ deadline: { sort: "asc", nulls: "last" } }, { receivedAt: "desc" }];
}
