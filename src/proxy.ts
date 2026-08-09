import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// NOT a security boundary. This only checks that a session cookie exists —
// a hand-forged cookie passes it. Its only job is skipping a wasted render
// for signed-out visitors. The real check is auth.api.getSession() inside
// app/dashboard/page.tsx.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard"],
};
