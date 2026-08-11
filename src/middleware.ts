import { withAuth } from "next-auth/middleware";

// Note: the Phase 5 import token is enforced inside
// src/app/api/imports/cleaned-master/route.ts — the matcher below excludes
// every /api path, so API auth never runs through this middleware.
export default withAuth({
  pages: {
    signIn: "/auth/signin",
  },
});

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
     * - /.well-known/* (public mobile-app association documents)
     * - static assets  (favicon, manifest, icons, sw.js)
     */
    "/((?!api|auth|_next/static|_next/image|favicon.ico|manifest.json|icon-|icons|sw.js|\\.well-known).*)",
  ],
};
