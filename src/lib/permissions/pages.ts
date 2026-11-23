import { isSuperAdmin } from "./can";

/**
 * Which permissions open each staff page. Holding any one of them opens it; an empty list means
 * only the Super Admin; a page not listed here is open to every admin. A longer path inherits
 * from the closest page above it (/care/billing/123 follows /care/billing).
 *
 * The lists give each built-in role exactly the pages it has always had. This file has no UI
 * imports, so the menu, the pages and the screens can all read it.
 */

/** The care office: everyone who works with patients day to day sees the clinical summaries. */
const CARE_OFFICE = ["records.view.clinical", "records.view.intake", "records.view.scheduling"];

export const pagePermissions: Record<string, readonly string[]> = {
  "/care/referrals": ["referrals.process", "referrals.triage"],
  "/care": ["patient-requests.process", "referrals.process", "referrals.triage"],
  "/care/patient-requests": ["patient-requests.process"],
  "/care/records": CARE_OFFICE,
  "/care/assessments": CARE_OFFICE,
  "/care/plans": CARE_OFFICE,
  "/care/progress": CARE_OFFICE,
  "/care/therapists": ["therapists.view"],
  "/care/sessions": CARE_OFFICE,
  "/care/documentation": CARE_OFFICE,
  "/care/coordination": CARE_OFFICE,
  "/telehealth/recordings": ["recordings.manage", "therapists.view"],
  "/care/schedule": ["schedule.manage"],
  "/care/funding": ["funding.edit", "funding.verify"],
  "/care/billing": ["finance.work"],
  "/care/operations": [
    "operations.retry-runs",
    "operations.manage",
    "operations.clinical",
    "operations.matching",
  ],
  "/care/reports": [
    "reports.read.referrals",
    "reports.read.participants",
    "reports.read.staff",
    "reports.read.scheduling",
    "reports.read.clinical-operations",
    "reports.read.telehealth",
    "reports.read.automation",
    "reports.read.audit",
    "reports.schedule",
  ],
  "/care/ai-agent": [
    "operations.team.intake",
    "operations.team.scheduling",
    "operations.team.operations",
  ],
  "/care/ai-oversight": CARE_OFFICE,
  // No permission opens these: they belong to the Super Admin.
  "/": [],
  "/care/users": [],
};

/** What a signed-in admin brings to a page check. */
export type PageAccess = { permissions: readonly string[]; superAdmin: boolean };

export const pageAccessFor = (user: {
  permissions: readonly string[];
  staffRoles: readonly string[];
}): PageAccess => ({ permissions: user.permissions, superAdmin: isSuperAdmin(user.staffRoles) });

/** The permissions a page asks for, or undefined when any admin may open it. */
export function pageRequirement(path: string): readonly string[] | undefined {
  const clean = path.split("?")[0]!.split("#")[0]!;
  // The dashboard is exactly "/": every other path starts with it, so it must not match them.
  if (clean === "/") return pagePermissions["/"];
  let best: string | undefined;
  for (const key of Object.keys(pagePermissions)) {
    if (key === "/") continue;
    if ((clean === key || clean.startsWith(`${key}/`)) && (!best || key.length > best.length)) {
      best = key;
    }
  }
  return best ? pagePermissions[best] : undefined;
}

/**
 * Whether the person may open the page. Without access details (nobody signed in, or the details
 * are still loading) every page shows, as before.
 */
export function canOpenPage(path: string, access: PageAccess | null | undefined): boolean {
  if (!access || access.superAdmin) return true;
  const need = pageRequirement(path);
  if (!need) return true;
  return need.some((id) => access.permissions.includes(id));
}
