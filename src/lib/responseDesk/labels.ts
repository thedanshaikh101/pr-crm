// Display helpers for Response Desk enums. Pure.

export const CONVERSATION_STATUSES = ["NEW", "IN_PROGRESS", "RESPONDED", "CLOSED"] as const;
export const TOPIC_STATUSES = ["OPEN", "MONITORING", "CLOSED"] as const;
export const INTERVIEW_STATUSES = ["REQUESTED", "PROPOSED", "CONFIRMED", "COMPLETED", "DECLINED", "CANCELLED"] as const;
export const INTERVIEW_FORMATS = ["LIVE", "PRE_RECORD", "PHONE", "IN_PERSON"] as const;
export const STATEMENT_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "EXPIRED"] as const;
export const CHANNELS = ["EMAIL", "PHONE", "SOCIAL", "OTHER"] as const;
export const ACTIVITY_KINDS = ["TASK", "CALL", "EMAIL", "MEETING"] as const;
export const ATTACHABLE_ENTITIES = ["conversation", "statement", "topic", "interview"] as const;

export const DEFAULT_CASE_TYPES = ["Media enquiry", "Interview request", "Statement request", "Data request", "Complaint", "Freedom of information", "Other"];
export const DEFAULT_TOPIC_TYPES = ["Issue", "Campaign", "Announcement", "Crisis", "Ongoing"];

export function humanize(s: string | null | undefined) {
  if (!s) return "";
  return s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Tailwind classes for a status pill. Neutral by default, warn for waiting states, good for done, bad for failed/cancelled. */
export function pillClass(status: string) {
  switch (status) {
    case "NEW": case "REQUESTED": case "OPEN": return "bg-accentSoft text-accent";
    case "IN_PROGRESS": case "PROPOSED": case "IN_REVIEW": case "MONITORING": return "bg-amber-50 text-warn";
    case "RESPONDED": case "CONFIRMED": case "APPROVED": case "COMPLETED": return "bg-green-50 text-good";
    case "DECLINED": case "CANCELLED": case "EXPIRED": return "bg-red-50 text-bad";
    case "CLOSED": case "DRAFT": default: return "bg-neutral-100 text-neutral-600";
  }
}

export function kindIcon(kind: string) {
  switch (kind) {
    case "CALL": return "☎";
    case "EMAIL": return "✉";
    case "MEETING": return "👥";
    default: return "☑";
  }
}

export function channelIcon(channel: string) {
  switch (channel) {
    case "EMAIL": return "✉";
    case "PHONE": return "☎";
    case "SOCIAL": return "＠";
    default: return "•";
  }
}

/** Where an entity reference points in the app. Unknown entities return null. */
export function entityHref(entity: string | null | undefined, entityId: string | null | undefined) {
  if (!entity || !entityId) return null;
  switch (entity) {
    case "contact": return `/contacts/${entityId}`;
    case "conversation": return `/response-desk/conversations/${entityId}`;
    case "release": return `/releases/${entityId}`;
    case "topic": return `/response-desk/topics/${entityId}`;
    case "statement": return `/response-desk/statements/${entityId}`;
    case "interview": return `/response-desk/interviews/${entityId}`;
    case "coverage": return `/coverage/${entityId}`;
    default: return null;
  }
}

/** Merge pick-list names with defaults and the value currently stored so a select never loses its value. */
export function selectOptions(items: string[], defaults: string[], current?: string | null) {
  const out = items.length ? [...items] : [...defaults];
  if (current && !out.includes(current)) out.unshift(current);
  return out;
}

export function truncate(s: string | null | undefined, n = 90) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t;
}

/** Relative age like "3h ago", "2d ago". */
export function ageLabel(at: Date | string, now: Date = new Date()) {
  const diff = Math.max(0, now.getTime() - new Date(at).getTime());
  if (diff < 6e4) return "just now";
  if (diff < 36e5) return `${Math.round(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.round(diff / 36e5)}h ago`;
  return `${Math.round(diff / 864e5)}d ago`;
}

/** Parse the JSON proposedTimes column into sorted ISO strings, dropping junk. */
export function proposedTimesOf(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.map((x) => (typeof x === "string" ? x : "")).filter((x) => x && !Number.isNaN(new Date(x).getTime())).sort();
}

/** Next proposed time at or after now, else the last one. */
export function nextProposed(times: string[], now: Date = new Date()) {
  const future = times.filter((t) => new Date(t).getTime() >= now.getTime());
  return future[0] ?? times[times.length - 1] ?? null;
}
