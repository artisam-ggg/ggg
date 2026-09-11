import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { buildSecurityHeaders } from "@/lib/security-headers";
import { env } from "@/lib/env";

export function isProtectedPath(pathname: string): boolean {
  // /tournaments/[id] is public-read; everything else under /tournaments is protected
  if (pathname === "/tournaments" || pathname === "/tournaments/") return true;
  if (pathname === "/tournaments/new" || pathname.startsWith("/tournaments/new/")) return true;
  if (/^\/tournaments\/[^/]+\/settle$/.test(pathname)) return true;
  // Single-segment /tournaments/[id] and any deeper non-settle paths are public
  if (/^\/tournaments\/[^/]+/.test(pathname)) return false;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export default withAuth(
  function middleware(request) {
    // Authentication is enforced by the withAuth authorized callback below.
    // This function runs only for allowed requests and applies security headers.
    const response = NextResponse.next();
    if (isProtectedPath(request.nextUrl.pathname)) {
      response.headers.set("Cache-Control", "no-store, max-age=0");
    }

    for (const [key, value] of buildSecurityHeaders()) {
      response.headers.set(key, value);
    }

    return response;
  },
  {
    // withAuth verifies the session JWT and needs the SAME secret the NextAuth
    // handler signs with (authOptions.secret = env.SESSION_SECRET). Without it,
    // withAuth falls back to NEXTAUTH_SECRET (never set) and every protected
    // route 500s with "there is a problem with the server configuration".
    secret: env.SESSION_SECRET,
    // getToken defaults to the `next-auth.session-token` cookie, but the handler
    // issues a custom `ggg.session` cookie (authOptions.cookies). Without this
    // override withAuth never finds the token and redirects every authed user to
    // /login.
    cookies: { sessionToken: { name: "ggg.session" } },
    callbacks: {
      authorized({ token, req }) {
        // Public paths are always allowed
        if (!isProtectedPath(req.nextUrl.pathname)) return true;
        // Protected paths require a valid session token
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  },
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
