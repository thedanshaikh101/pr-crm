export function hygienePct(members: { contact: { email: string | null; emailStatus: string } }[]) {
  if (!members.length) return 0;
  const ok = members.filter((m) => m.contact.email && !["BOUNCED", "INVALID", "COMPLAINED"].includes(m.contact.emailStatus)).length;
  return Math.round((ok / members.length) * 100);
}

/** Engagement In: open + reply rates over the last 90 days of distributions to this list. */
export function engagementIn(recips: { firstOpenAt: Date | null; repliedAt: Date | null; deliveredAt: Date | null }[]) {
  const delivered = recips.filter((r) => r.deliveredAt).length;
  if (!delivered) return "—";
  const score = (recips.filter((r) => r.firstOpenAt).length + 3 * recips.filter((r) => r.repliedAt).length) / delivered;
  return score >= 0.4 ? "High" : score >= 0.15 ? "Medium" : "Low";
}
