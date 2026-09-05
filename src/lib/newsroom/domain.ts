// Pure custom-domain checks; the DNS lookups live in src/server/newsroom.ts.

export const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function normalizeDomain(input: string) {
  return (input ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
}

/** True when the CNAME points at the target, or (no CNAME) the A records overlap with the app host's. */
export function domainMatches(found: { cnames: string[]; a: string[] }, target: string, appA: string[]) {
  const t = normalizeDomain(target);
  if (found.cnames.some((c) => normalizeDomain(c) === t)) return true;
  if (found.cnames.length) return false;
  return found.a.length > 0 && found.a.some((ip) => appA.includes(ip));
}

export function describeRecords(found: { cnames: string[]; a: string[] }) {
  if (found.cnames.length) return `CNAME ${found.cnames.join(", ")}`;
  if (found.a.length) return `A ${found.a.join(", ")}`;
  return "no CNAME or A record";
}
