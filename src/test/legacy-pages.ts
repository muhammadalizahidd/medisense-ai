/**
 * The menu as it was before pages followed permissions: which admin responsibilities opened each
 * staff page. Frozen here as the oracle the permission-based page map is tested against.
 */

const INTAKE = "Intake Officer";
const SCHED = "Scheduler";
const FIN = "Finance";
const FINM = "Finance Manager";
const OPS = "Operations Manager";
const LEAD = "Clinical Lead";
const CARE = [INTAKE, SCHED, LEAD, OPS];

export const legacyPageAccess: Record<string, string[]> = {
  "/care/referrals": [INTAKE, LEAD],
  "/care": [INTAKE, SCHED, LEAD],
  "/care/patient-requests": [INTAKE, SCHED, LEAD],
  "/care/records": CARE,
  "/care/assessments": CARE,
  "/care/plans": CARE,
  "/care/progress": CARE,
  "/care/therapists": [SCHED, LEAD, OPS],
  "/care/sessions": CARE,
  "/care/documentation": CARE,
  "/care/coordination": [INTAKE, SCHED, LEAD, OPS],
  "/telehealth/recordings": [SCHED, LEAD, OPS],
  "/care/schedule": [SCHED, OPS],
  "/care/funding": [INTAKE, FIN, FINM],
  "/care/billing": [FIN, FINM],
  "/care/operations": [INTAKE, SCHED, FINM, LEAD, OPS],
  "/care/reports": [INTAKE, SCHED, FINM, LEAD, OPS],
  "/care/ai-agent": [INTAKE, SCHED, OPS],
  "/care/ai-oversight": CARE,
  "/care/hr": [LEAD, OPS],
  "/care/hr/leave": [LEAD, OPS],
  "/care/hr/timesheets": [LEAD, OPS],
  "/": [],
  "/care/users": [],
};

/** Whether someone with these responsibilities opened the page in the old menu. */
export function legacyCanOpen(href: string, staffRoles: readonly string[] | null | undefined) {
  if (!staffRoles?.length || staffRoles.includes("Super Admin")) return true;
  const need = legacyPageAccess[href];
  return !need || need.some((r) => staffRoles.includes(r));
}
