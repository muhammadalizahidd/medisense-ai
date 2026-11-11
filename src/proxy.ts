import { NextResponse, type NextRequest } from "next/server";
import { accessFor } from "@/lib/access";
import type { Role } from "@/lib/live/types";

const COOKIE = "medisense_session";
const TTL = 20_000;

/** A short cache of session → role, so each page load doesn't wait on the sign-in check. */
const roles = new Map<string, { role: Role | null; at: number }>();

async function roleOf(request: NextRequest): Promise<Role | null> {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const cached = roles.get(token);
  if (cached && Date.now() - cached.at < TTL) return cached.role;
  try {
    const res = await fetch(new URL("/api/auth/me", request.url), {
      headers: { cookie: `${COOKIE}=${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as { user: { role: Role } | null };
    const role = data.user?.role ?? null;
    roles.set(token, { role, at: Date.now() });
    if (roles.size > 500) roles.delete(roles.keys().next().value!);
    return role;
  } catch {
    // If the check fails (the database is down, say), treat them as signed out: sign-in explains.
    return null;
  }
}

/** Runs before every page: sends people to the screens their role allows. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const access = accessFor(path, await roleOf(request));
  if (access.allow) return NextResponse.next();
  return NextResponse.redirect(new URL(access.redirect, request.url));
}

export const config = {
  // Pages only: not the API (which checks access itself), Next's files or static assets.
  matcher: ["/((?!api|_next|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
