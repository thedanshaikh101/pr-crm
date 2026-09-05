// Pure host matching used by src/middleware.ts. Decides whether a request host is the app
// itself, a `<slug>.<NEWSROOM_DOMAIN>` newsroom subdomain, or a customer's custom domain.

export type HostMatch = { kind: "app" } | { kind: "subdomain"; slug: string } | { kind: "custom"; host: string };

export function stripPort(host: string) {
  const h = (host ?? "").trim().toLowerCase();
  if (h.startsWith("[")) return h.replace(/\]:\d+$/, "]"); // ipv6 literal
  return h.replace(/:\d+$/, "");
}

export function resolveHost(host: string, appHost: string, newsroomDomain: string): HostMatch {
  const h = stripPort(host);
  const app = stripPort(appHost);
  const nd = stripPort(newsroomDomain);
  if (!h || h === app || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "0.0.0.0") return { kind: "app" };
  if (nd && h === nd) return { kind: "app" };
  if (nd && h.endsWith(`.${nd}`)) {
    const rest = h.slice(0, -(nd.length + 1));
    const slug = rest.split(".").filter(Boolean)[0] ?? "";
    if (!slug || slug === "www") return { kind: "app" };
    return { kind: "subdomain", slug };
  }
  if (!/^[a-z0-9.-]+$/.test(h)) return { kind: "app" };
  return { kind: "custom", host: h };
}
