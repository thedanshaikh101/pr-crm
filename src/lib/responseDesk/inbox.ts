// Inbound email -> Conversation. Pure; tested in tests/inbox.test.ts.
import { stripTags } from "@/lib/html";

export type NormalizedEmail = {
  fromEmail: string | null;
  fromName: string | null;
  subject: string;
  textExcerpt: string;
  messageId: string | null;
  receivedAt: Date;
};

const EXCERPT_CHARS = 600;

/** "Dana Reyes <dana@example.com>" | "dana@example.com" | { email, name } -> parts */
export function parseAddress(from: unknown): { email: string | null; name: string | null } {
  if (!from) return { email: null, name: null };
  if (Array.isArray(from)) return parseAddress(from[0]);
  if (typeof from === "object") {
    const o = from as { email?: string; address?: string; name?: string; value?: unknown };
    if (o.value) return parseAddress(o.value);
    const email = (o.email ?? o.address ?? "").trim().toLowerCase() || null;
    return { email, name: (o.name ?? "").trim() || null };
  }
  const s = String(from).trim();
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2].trim().toLowerCase() || null, name: m[1].trim() || null };
  const bare = s.match(/[^\s<>@]+@[^\s<>]+/);
  return { email: bare ? bare[0].toLowerCase() : null, name: null };
}

function headerOf(headers: unknown, key: string): string | null {
  if (!headers) return null;
  if (Array.isArray(headers)) {
    const hit = headers.find((h) => h && typeof h === "object" && String((h as any).name ?? "").toLowerCase() === key);
    return hit ? String((hit as any).value ?? "") : null;
  }
  if (typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) if (k.toLowerCase() === key) return v == null ? null : String(v);
  }
  return null;
}

/** Accepts the Resend inbound shape ({from,to,subject,text,html,headers:{"message-id"}}, optionally wrapped in {type,data})
 *  or a generic {from,subject,text,html,messageId,receivedAt}. */
export function normalizeInboundEmail(input: any): NormalizedEmail {
  const src = input && typeof input === "object" && input.data && typeof input.data === "object" && (input.type || !input.from) ? input.data : input ?? {};
  const { email, name } = parseAddress(src.from ?? src.sender);
  const subject = String(src.subject ?? "").replace(/\s+/g, " ").trim() || "(no subject)";
  const text = typeof src.text === "string" && src.text.trim() ? src.text : typeof src.html === "string" ? stripTags(src.html) : "";
  const textExcerpt = text.replace(/\r\n/g, "\n").trim().slice(0, EXCERPT_CHARS);
  const rawId = src.messageId ?? src.message_id ?? src.email_id ?? headerOf(src.headers, "message-id");
  const messageId = rawId ? String(rawId).trim().replace(/^<|>$/g, "") || null : null;
  const at = src.receivedAt ?? src.received_at ?? src.created_at ?? src.date ?? headerOf(src.headers, "date");
  const parsed = at ? new Date(at) : new Date();
  return { fromEmail: email, fromName: name, subject, textExcerpt, messageId, receivedAt: Number.isNaN(parsed.getTime()) ? new Date() : parsed };
}

export type MatchedContact = { id: string; organization?: { name: string } | null } | null;

export function senderDomain(email: string | null) {
  const d = (email ?? "").split("@")[1]?.trim().toLowerCase();
  return d || null;
}

/** Conversation create data (without accountId) for a normalised email and an optional matched contact. */
export function conversationFromEmail(norm: NormalizedEmail, contact: MatchedContact) {
  const outletName = contact?.organization?.name ?? senderDomain(norm.fromEmail) ?? norm.fromName ?? null;
  const question = norm.textExcerpt ? `${norm.subject}\n\n${norm.textExcerpt}` : norm.subject;
  return {
    channel: "EMAIL" as const,
    question,
    outletName,
    contactId: contact?.id ?? null,
    receivedAt: norm.receivedAt,
    sourceMessageId: norm.messageId,
    status: "NEW" as const,
  };
}
