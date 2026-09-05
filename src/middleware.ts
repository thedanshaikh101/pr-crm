import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/newsroom/host";

// Paths that are never host-rewritten, whatever host they arrive on.
const HOST_SKIP = /^\/(n|r|api|_next|o|t|u)(\/|$)/;
const NEWSROOM_PRINT = /^\/n\//;

function appHost() {
  try { return new URL(process.env.APP_URL ?? "http://localhost:3000").host; } catch { return "localhost"; }
}

/** Newsroom host routing: `<slug>.<NEWSROOM_DOMAIN>` and verified custom domains are rewritten to /n/... */
function newsroomRewrite(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (HOST_SKIP.test(pathname)) return null;
  const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const match = resolveHost(rawHost, appHost(), process.env.NEWSROOM_DOMAIN || "newsroom.localhost");
  if (match.kind === "app") return null;
  const url = req.nextUrl.clone();
  const tail = pathname === "/" ? "" : pathname;
  url.pathname = match.kind === "subdomain" ? `/n/${match.slug}${tail}` : `/n/_host/${match.host}${tail}`;
  const headers = new Headers(req.headers);
  headers.set("x-newsroom-base", "");
  headers.set("x-newsroom-host", rawHost);
  if (req.nextUrl.searchParams.get("print") === "1") headers.set("x-newsroom-print", "1");
  return NextResponse.rewrite(url, { request: { headers } });
}

// Cheap gate: presence of the session cookie. Real validation happens in requireViewer().
const PUBLIC = [/^\/login/, /^\/register/, /^\/verify/, /^\/reset/, /^\/api\//, /^\/n\//, /^\/r\//, /^\/t\//, /^\/o\//, /^\/u\//, /^\/_next/, /^\/favicon/, /^\/$/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rewritten = newsroomRewrite(req);
  if (rewritten) return rewritten;
  if (NEWSROOM_PRINT.test(pathname) && req.nextUrl.searchParams.get("print") === "1") {
    const headers = new Headers(req.headers);
    headers.set("x-newsroom-print", "1");
    return NextResponse.next({ request: { headers } });
  }
  const headers = new Headers(req.headers);
  headers.set("x-pd-path", pathname);
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next({ request: { headers } });
  if (!req.cookies.get("pd_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
