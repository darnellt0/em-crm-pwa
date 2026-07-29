import { withAuth } from "next-auth/middleware";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const authMiddleware = withAuth({
  pages: {
    signIn: "/auth/signin",
  },
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const phase5Token = process.env.PHASE5_IMPORT_TOKEN?.trim();
  const isPhase5Import = request.nextUrl.pathname === "/api/imports/cleaned-master";

  if (
    isPhase5Import &&
    process.env.NODE_ENV !== "production" &&
    phase5Token &&
    request.headers.get("x-phase5-import-token") === phase5Token
  ) {
    return NextResponse.next();
  }

  return authMiddleware(request as never, event);
}

export const config = {
  matcher: [
    /*
     * Apply NextAuth middleware only to dashboard pages — NOT to API routes.
     * API routes handle their own auth via requireRole() + handleAuthError()
     * and must return 401/403 JSON responses. If the middleware intercepts them
     * it returns a 307 redirect to sign-in instead of a machine-readable error.
     *
     * Excluded from middleware:
     * - /api/*         (all API routes — handle auth themselves)
     * - /auth/*        (sign-in / verify pages)
     * - /_next/*       (Next.js internals)
     * - static assets  (favicon, manifest, icons, sw.js)
     */
    "/((?!api|auth|_next/static|_next/image|favicon.ico|manifest.json|icon-|icons|sw.js).*)",
  ],
};
