import { NextResponse, type NextRequest } from "next/server";
import { accessFor, type Session } from "@/lib/access";
import type { AppAccess } from "@/lib/permissions/apps";
import type { Role } from "@/lib/live/types";

const COOKIE = "medisense_session";
const TTL = 20_000;

/** A short cache of session → who they are, so each page load doesn't wait on the sign-in check. */
const sessions = new Map<string, { session: Session | null; at: number }>();

type MeReply = { user: { role: Role } | null; apps?: AppAccess; home?: string };

async function sessionOf(request: NextRequest): Promise<Session | null> {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const cached = sessions.get(token);
  if (cached && Date.now() - cached.at < TTL) return cached.session;
  try {
    const res = await fetch(new URL("/api/auth/me", request.url), {
      headers: { cookie: `${COOKIE}=${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as MeReply;
    const session =
      data.user && data.apps && data.home
        ? { role: data.user.role, apps: data.apps, home: data.home }
        : null;
    sessions.set(token, { session, at: Date.now() });
    if (sessions.size > 500) sessions.delete(sessions.keys().next().value!);
    return session;
  } catch {
    // If the check fails (the database is down, say), treat them as signed out: sign-in explains.
    return null;
  }
}

/** Runs before every page: sends people to the screens their role and apps allow. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const access = accessFor(path, await sessionOf(request));
  if (access.allow) return NextResponse.next();
  return NextResponse.redirect(new URL(access.redirect, request.url));
}

export const config = {
  // Pages only: not the API (which checks access itself), Next's files or static assets.
  matcher: ["/((?!api|_next|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
