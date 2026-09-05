// Pure purge planning. planPurge() turns search matches into ordered steps; the server action
// executes them inside a transaction. Keeping the plan pure means the order (null foreign keys
// before hard-deleting contacts) and the redaction format are unit-tested.
import { createHash } from "crypto";
import type { GdprMatches } from "./search";

export type PurgeStep =
  | { op: "nullContactRefs"; table: "coverage" | "conversation" | "interviewRequest" | "distributionRecipient"; contactIds: string[] }
  | { op: "deleteContacts"; ids: string[] }
  | { op: "redactRecipients"; rows: { id: string; email: string; name: string }[] }
  | { op: "deleteSuppressions"; ids: string[] }
  | { op: "deleteInvitations"; ids: string[] }
  | { op: "scrubNotes"; ids: string[]; needle: string }
  | { op: "scrubAuditMeta"; ids: string[] };

export type PurgePlan = { steps: PurgeStep[]; counts: Record<string, number>; queryHash: string };

export function redactedEmail(original: string) {
  return `redacted-${createHash("sha1").update(original.toLowerCase()).digest("hex").slice(0, 8)}@invalid`;
}

export function hashQuery(q: string) {
  return createHash("sha256").update(q.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** Replace every case-insensitive occurrence of `needle` in `text` with [redacted]. */
export function scrubText(text: string, needle: string) {
  if (!needle) return text;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return text.replace(re, "[redacted]");
}

export function planPurge(m: GdprMatches): PurgePlan {
  const by = (t: string) => m.groups.find((g) => g.table === t)?.rows ?? [];
  const contactIds = by("Contact").map((r) => String(r.id));
  const recipients = by("DistributionRecipient").map((r) => ({ id: String(r.id), email: redactedEmail(String(r.email)), name: "Redacted" }));
  const suppressionIds = by("Suppression").map((r) => String(r.id));
  const invitationIds = by("Invitation").map((r) => String(r.id));
  const noteIds = by("Note").map((r) => String(r.id));
  const auditIds = by("AuditLog").map((r) => String(r.id));

  const steps: PurgeStep[] = [];
  if (contactIds.length) {
    for (const table of ["coverage", "conversation", "interviewRequest", "distributionRecipient"] as const) steps.push({ op: "nullContactRefs", table, contactIds });
    steps.push({ op: "deleteContacts", ids: contactIds });
  }
  if (recipients.length) steps.push({ op: "redactRecipients", rows: recipients });
  if (suppressionIds.length) steps.push({ op: "deleteSuppressions", ids: suppressionIds });
  if (invitationIds.length) steps.push({ op: "deleteInvitations", ids: invitationIds });
  if (noteIds.length) steps.push({ op: "scrubNotes", ids: noteIds, needle: m.q });
  if (auditIds.length) steps.push({ op: "scrubAuditMeta", ids: auditIds });

  return {
    steps,
    counts: { contacts: contactIds.length, recipients: recipients.length, suppressions: suppressionIds.length, invitations: invitationIds.length, notes: noteIds.length, auditLogs: auditIds.length },
    queryHash: hashQuery(m.q),
  };
}
