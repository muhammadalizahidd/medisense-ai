import { homeFor } from "@/lib/live/routes";
import type { Role } from "@/lib/live/types";
import { isSuperAdmin } from "./can";

/*
 * Which apps a person may open. The admin, therapist and mobile apps are switches on each role;
 * a person's apps are what their roles switch on. Routes that belong to an app are blocked for
 * everyone else, in the proxy, on the page and in the menus, from this one place.
 */

/** Pages anyone can open, signed in or not: they handle their own sign-in or need none. */
export const PUBLIC = [
  "/login",
  "/refer",
  "/join/",
  "/checkin/",
  "/appointment/",
  "/contact/",
  "/agreement/",
  "/upload/",
  "/mobile/patient",
];

/** Every signed-in person can open their own profile, whatever apps they have. */
const PROFILE = "/profile";

export const MOBILE_APPS = ["family", "patient", "staff", "therapist"] as const;
export type MobileApp = (typeof MOBILE_APPS)[number];

export type AppAccess = {
  admin: boolean;
  therapist: boolean;
  mobile: Record<MobileApp, boolean>;
};

export const ALL_APPS: AppAccess = {
  admin: true,
  therapist: true,
  mobile: { family: true, patient: true, staff: true, therapist: true },
};

export const NO_APPS: AppAccess = {
  admin: false,
  therapist: false,
  mobile: { family: false, patient: false, staff: false, therapist: false },
};

/**
 * The admin app is for doing something in it, so a person whose roles grant no permission besides
 * the app switches has no admin app, even with the switch on.
 */
const hasWork = (held: ReadonlySet<string> | readonly string[]) =>
  [...held].some((id) => !id.startsWith("app."));

/** The apps a staff person gets from the permissions they hold. The Super Admin has them all. */
export function appsFor(
  held: ReadonlySet<string> | readonly string[],
  staffRoles: readonly string[] | null | undefined,
): AppAccess {
  if (isSuperAdmin(staffRoles)) return ALL_APPS;
  const has = (id: string) =>
    Array.isArray(held) ? held.includes(id) : (held as ReadonlySet<string>).has(id);
  return {
    admin: has("app.admin") && hasWork(held),
    therapist: has("app.therapist"),
    mobile: {
      family: has("app.mobile.family"),
      patient: has("app.mobile.patient"),
      staff: has("app.mobile.staff"),
      therapist: has("app.mobile.therapist"),
    },
  };
}

/**
 * Therapists and patients keep fixed apps whatever is stored: a therapist sees only the therapist
 * app, a patient only the patient app.
 */
export function appsForRole(
  role: Role,
  held: ReadonlySet<string> | readonly string[],
  staffRoles: readonly string[] | null | undefined,
): AppAccess {
  if (role === "therapist") return { ...NO_APPS, therapist: true };
  if (role === "client") return { ...NO_APPS, mobile: { ...NO_APPS.mobile, patient: true } };
  return appsFor(held, staffRoles);
}

/**
 * Removes every permission except the app switches when the admin app is off, so a disabled app
 * is refused by the API as well as the screens. The Super Admin keeps everything.
 */
export function limitToApps(held: Set<string>, staffRoles: readonly string[] | null | undefined) {
  if (isSuperAdmin(staffRoles) || (held.has("app.admin") && hasWork(held))) return held;
  return new Set([...held].filter((id) => id.startsWith("app.")));
}

const under = (path: string, prefix: string) =>
  prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`);

const clean = (path: string) => path.split("?")[0]!.split("#")[0]!;

/** Whether a page is open to everyone or to every signed-in person, so no app owns it. */
const isOpenPath = (path: string) => under(path, PROFILE) || PUBLIC.some((p) => under(path, p));

/** The app a path belongs to. Null for pages every person can open. */
export function appForPath(path: string): "admin" | "therapist" | `mobile.${MobileApp}` | null {
  const p = clean(path);
  if (under(p, "/therapist") || under(p, "/telehealth/room")) return "therapist";
  const mobile = /^\/mobile\/([a-z]+)/.exec(p)?.[1];
  if (mobile && (MOBILE_APPS as readonly string[]).includes(mobile)) {
    return `mobile.${mobile as MobileApp}`;
  }
  if (isOpenPath(p)) return null;
  return "admin";
}

/**
 * Whether the apps let a person open the path. The admin app's switch only governs staff. A
 * therapist's own pages are opened by their role rules, so the switch doesn't close them.
 */
export function appOpen(path: string, apps: AppAccess, role?: Role): boolean {
  const app = appForPath(path);
  if (app === null) return true;
  if (app === "admin") return role !== undefined && role !== "admin" ? true : apps.admin;
  if (app === "therapist") return apps.therapist;
  return apps.mobile[app.slice("mobile.".length) as MobileApp];
}

/**
 * Where a person lands: their usual home if the apps open it, otherwise the first app they have,
 * otherwise their profile.
 */
export function landingPath(
  role: Role,
  staffRoles: readonly string[] | null | undefined,
  apps: AppAccess,
): string {
  const options = [
    homeFor(role, staffRoles),
    "/therapist",
    "/mobile/therapist",
    "/mobile/staff",
    "/mobile/patient",
    "/mobile/family",
  ];
  return options.find((p) => appOpen(p, apps)) ?? PROFILE;
}
