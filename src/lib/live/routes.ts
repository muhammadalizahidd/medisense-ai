import type { Role } from "./types";

/** Where each kind of account lands after signing in. */
export function homeFor(role: Role) {
  if (role === "admin") return "/care";
  if (role === "therapist") return "/therapist";
  return "/mobile/patient";
}

/** Only same-site paths are accepted as a place to return to after signing in. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : null;
}
