/** Sending-domain guards. Pure so they unit-test without a DB. */
export type DomainRow = { domain: string; status: string };

export function emailDomain(email: string) {
  const at = (email ?? "").trim().lastIndexOf("@");
  return at < 0 ? "" : email.trim().slice(at + 1).toLowerCase().replace(/>$/, "");
}

/** True when the address's domain is one of the account's VERIFIED sending domains. */
export function fromAllowed(domains: DomainRow[], email: string) {
  const d = emailDomain(email);
  if (!d) return false;
  return domains.some((x) => x.status === "VERIFIED" && x.domain.toLowerCase() === d);
}

export function isHostname(s: string) {
  const h = (s ?? "").trim().toLowerCase();
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h);
}

/** "Name <addr>" for the From header. */
export function formatFrom(name: string, email: string) {
  const n = (name ?? "").replace(/["<>]/g, "").trim();
  return n ? `${n} <${email.trim()}>` : email.trim();
}
