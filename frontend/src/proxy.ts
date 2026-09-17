import { NextRequest, NextResponse } from "next/server";

/**
 * Edge route protection for the SPA. Reads the `crm_auth_present` cookie that
 * the client sets on login/signup (never the real token — that stays in
 * localStorage/in-memory, unreachable from the edge). Unauthenticated visitors
 * are sent to /login; authenticated users are kept out of the auth pages.
 *
 * `AuthGuard` remains the client-side backstop for a logout/session-expiry
 * that happens entirely in the browser after this cookie is already set.
 */
const AUTH_COOKIE = "crm_auth_present";

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/accept-invitation",
  "/unauthorized",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === "1";

  if (!PUBLIC_PATHS.has(pathname)) {
    if (!isAuthenticated) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?from=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Authenticated users don't need the auth pages; land them in the app.
  if (isAuthenticated && (pathname === "/login" || pathname === "/signup")) {
    const inboxUrl = request.nextUrl.clone();
    inboxUrl.pathname = "/inbox";
    return NextResponse.redirect(inboxUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on all routes except Next internals and static assets
     * (include/exclude block copied from Next.js docs convention).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)",
  ],
};