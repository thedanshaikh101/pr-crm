/** Reply detection. Pure matcher shared by the inbound webhook and the IMAP poller. */
export type InboundMessage = {
  from: string; // "Name <addr>" or bare
  subject?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  text?: string | null;
};

export type ReplyCandidate = {
  id: string;
  providerMsgId: string | null;
  email: string;
  sentAt: Date | string | null; // distribution start or recipient delivery time
};

export const REPLY_WINDOW_DAYS = 30;

export function parseAddress(s: string | null | undefined) {
  const v = (s ?? "").trim();
  const m = /<([^<>]+)>/.exec(v);
  return (m ? m[1] : v).trim().toLowerCase();
}

/** Message-id tokens from In-Reply-To / References. Returns both the full id and its local part. */
export function messageIdTokens(...headers: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const h of headers) {
    for (const m of (h ?? "").matchAll(/<([^<>\s]+)>|([^\s<>,]+@[^\s<>,]+)/g)) {
      const id = (m[1] ?? m[2] ?? "").trim();
      if (!id) continue;
      out.add(id);
      const at = id.indexOf("@");
      if (at > 0) out.add(id.slice(0, at));
    }
  }
  return Array.from(out);
}

/** Normalize a Resend inbound payload or the simplified generic shape. */
export function normalizeInbound(body: any): InboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const headers: Record<string, string> = {};
  const rawHeaders = data.headers;
  if (Array.isArray(rawHeaders)) for (const h of rawHeaders) if (h?.name) headers[String(h.name).toLowerCase()] = String(h.value ?? "");
  else if (rawHeaders && typeof rawHeaders === "object") for (const [k, val] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = String(val ?? "");
  const from = Array.isArray(data.from) ? data.from[0] : data.from;
  if (!from) return null;
  return {
    from: String(from),
    subject: data.subject ?? null,
    inReplyTo: data.inReplyTo ?? data.in_reply_to ?? headers["in-reply-to"] ?? null,
    references: data.references ?? headers["references"] ?? null,
    text: data.text ?? data.plain ?? null,
  };
}

/** First by In-Reply-To / References containing a stored provider message id, then by sender within the reply window. */
export function matchReply(msg: InboundMessage, candidates: ReplyCandidate[], now = new Date()): ReplyCandidate | null {
  const tokens = messageIdTokens(msg.inReplyTo, msg.references);
  if (tokens.length) {
    const byId = candidates.find((c) => c.providerMsgId && tokens.includes(c.providerMsgId));
    if (byId) return byId;
  }
  const from = parseAddress(msg.from);
  if (!from) return null;
  const since = now.getTime() - REPLY_WINDOW_DAYS * 864e5;
  const recent = candidates
    .filter((c) => c.email.toLowerCase() === from)
    .map((c) => ({ c, t: c.sentAt ? new Date(c.sentAt).getTime() : 0 }))
    .filter((x) => x.t >= since && x.t <= now.getTime() + 6e4)
    .sort((a, b) => b.t - a.t);
  return recent[0]?.c ?? null;
}

export function excerptOf(text: string | null | undefined, n = 200) {
  const t = (text ?? "").replace(/\r/g, "").split(/\n>|\nOn .* wrote:/)[0].replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
