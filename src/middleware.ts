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
     * Match all request paths except:
     * - api/auth (NextAuth routes)
     * - auth (sign-in page)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!api/auth|auth|_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js).*)",
  ],
};
