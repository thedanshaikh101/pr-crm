/** Recipient resolution for a distribution: parse ad hoc lines, dedupe by email, count the unsendable. Pure. */
export type Candidate = {
  contactId?: string | null;
  name?: string | null;
  outlet?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  source: "list" | "contact" | "adhoc" | "test";
};

export type Resolved = {
  total: number;
  unique: number;
  duplicates: number;
  noValidEmail: number;
  suppressed: number;
  sending: number;
  recipients: { email: string; name: string | null; outlet: string | null; contactId: string | null }[];
};

export const BAD_STATUSES = ["INVALID", "BOUNCED", "COMPLAINED", "UNSUBSCRIBED"];
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isEmailSyntax(email: string | null | undefined) {
  return !!email && EMAIL_RE.test(email.trim());
}

/** "Name <email>" or bare email, one per line. Ignores blank lines and lines without a usable email. */
export function parseAdHoc(text: string): { name: string | null; email: string }[] {
  const out: { name: string | null; email: string }[] = [];
  for (const raw of (text ?? "").split(/\r?\n|,|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.*?)\s*<([^<>]+)>\s*$/.exec(line);
    const email = (m ? m[2] : line).trim().toLowerCase();
    if (!isEmailSyntax(email)) continue;
    const name = m ? m[1].replace(/^["']|["']$/g, "").trim() || null : null;
    out.push({ name, email });
  }
  return out;
}

export function resolveRecipients(candidates: Candidate[], suppressedEmails: Iterable<string>): Resolved {
  const suppressed = new Set(Array.from(suppressedEmails, (e) => e.toLowerCase().trim()));
  const seen = new Set<string>();
  const seenContacts = new Set<string>();
  const out: Resolved = { total: candidates.length, unique: 0, duplicates: 0, noValidEmail: 0, suppressed: 0, sending: 0, recipients: [] };
  for (const c of candidates) {
    const email = (c.email ?? "").trim().toLowerCase();
    const valid = isEmailSyntax(email) && !BAD_STATUSES.includes(c.emailStatus ?? "");
    if (!valid) {
      if (c.contactId) { if (seenContacts.has(c.contactId)) { out.duplicates++; continue; } seenContacts.add(c.contactId); }
      out.noValidEmail++;
      continue;
    }
    if (seen.has(email)) { out.duplicates++; continue; }
    seen.add(email);
    if (c.contactId) seenContacts.add(c.contactId);
    out.unique++;
    if (suppressed.has(email)) { out.suppressed++; continue; }
    out.recipients.push({ email, name: c.name?.trim() || null, outlet: c.outlet?.trim() || null, contactId: c.contactId ?? null });
  }
  out.sending = out.recipients.length;
  return out;
}
