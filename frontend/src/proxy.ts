import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "crm_auth_present";
const PROTECTED_PREFIXES = ["/dashboard", "/inbox", "/conversations", "/contacts", "/analytics", "/settings"];
const PUBLIC_AUTH_PATHS = ["/login"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAuthCookie = request.cookies.get(AUTH_COOKIE)?.value === "1";

  if (isProtectedPath(pathname) && !hasAuthCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (PUBLIC_AUTH_PATHS.includes(pathname) && hasAuthCookie) {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/inbox/:path*",
    "/conversations/:path*",
    "/contacts/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/login",
  ],
};
