import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/auth/signin",
  },
});

export const config = {
  matcher: [
    /*
     * Apply NextAuth middleware only to dashboard pages — NOT to API routes.
     * API routes handle their own auth via requireUser() + handleAuthError()
     * and must return 401/403 JSON responses. If the middleware intercepts them
     * it returns a 307 redirect to sign-in instead of a machine-readable error.
     *
     * Excluded from middleware:
     * - /api/*         (all API routes — handle auth themselves)
     * - /auth/*        (sign-in / verify pages)
     * - /_next/*       (Next.js internals)
     * - static assets  (favicon, manifest, icons, sw.js)
     */
    "/((?!api|auth|_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js).*)",
  ],
};
