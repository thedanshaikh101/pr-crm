import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: presence of the session cookie. Real validation happens in requireViewer().
const PUBLIC = [/^\/login/, /^\/register/, /^\/verify/, /^\/reset/, /^\/api\//, /^\/n\//, /^\/r\//, /^\/t\//, /^\/_next/, /^\/favicon/, /^\/$/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("pd_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
