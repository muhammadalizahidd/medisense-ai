import { canOpenPage, type PageAccess } from "@/lib/permissions/pages";
import {
  ChartColumn,
  UserCog,
  IdCard,
  CalendarOff,
  Timer,
  CircleUserRound,
  Landmark,
  Stethoscope,
  UserPlus,
  MessagesSquare,
  BellRing,
  Briefcase,
  CalendarClock,
  CalendarRange,
  CalendarDays,
  ChartLine,
  ChartPie,
  ClipboardList,
  Target,
  CalendarCheck,
  TrendingUp,
  FileSignature,
  Contact,
  FileText,
  FileInput,
  ListChecks,
  ArrowLeftRight,
  Building2,
  Tablet,
  Video,
  Flag,
  History,
  Mic,
  Hospital,
  Receipt,
  FormInput,
  Map as MapIcon,
  LayoutDashboard,
  Lock,
  Smartphone,
  UserCheck,
  Users,
  Workflow,
  type LucideIcon,
  BotMessageSquare,
  Sun,
} from "lucide-react";

export type Role = "Leadership" | "Admin" | "Supervisor" | "Clinician";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Roles that see this page in the sidebar. Pages stay reachable from links. */
  roles: Role[];
};

const L: Role = "Leadership";
const A: Role = "Admin";
const S: Role = "Supervisor";
const C: Role = "Clinician";

export const navigation: { group: string; items: NavItem[] }[] = [
  {
    group: "Organisation",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: [L, A] },
      { href: "/since-yesterday", label: "Since yesterday", icon: History, roles: [L] },
      { href: "/before-after", label: "Before and after", icon: ArrowLeftRight, roles: [L] },
      { href: "/team-capacity", label: "Team capacity", icon: Users, roles: [L, S] },
      { href: "/analytics", label: "AI insights", icon: ChartLine, roles: [L, S] },
      {
        href: "/patients-requiring-attention",
        label: "Patients to review",
        icon: Flag,
        badge: 14,
        roles: [L, A, S],
      },
    ],
  },
  {
    group: "Live care",
    items: [
      { href: "/care", label: "Patients", icon: UserPlus, roles: [L, A] },
      { href: "/care/therapists", label: "Therapists", icon: Stethoscope, roles: [L, A] },
      { href: "/care/schedule", label: "Scheduling", icon: CalendarRange, roles: [L, A] },
      { href: "/care/funding", label: "Funding and agreements", icon: Landmark, roles: [L, A] },
      { href: "/care/billing", label: "Billing and finance", icon: Receipt, roles: [L, A] },
      { href: "/care/hr", label: "Credentials and compliance", icon: IdCard, roles: [L, A] },
      { href: "/care/hr/leave", label: "Leave and absence", icon: CalendarOff, roles: [L, A] },
      { href: "/care/hr/timesheets", label: "Timesheets", icon: Timer, roles: [L, A] },
      { href: "/care/operations", label: "Work and approvals", icon: Workflow, roles: [L, A] },
      { href: "/care/records", label: "Clinical records", icon: FileText, roles: [L, A] },
      { href: "/care/assessments", label: "Assessments", icon: ClipboardList, roles: [L, A] },
      { href: "/care/plans", label: "Treatment plans", icon: Target, roles: [L, A] },
      {
        href: "/care/sessions",
        label: "Sessions and notes",
        icon: CalendarCheck,
        roles: [L, A],
      },
      { href: "/care/documentation", label: "Documentation", icon: FileSignature, roles: [L, A] },
      { href: "/care/progress", label: "Progress and reports", icon: TrendingUp, roles: [L, A] },
      { href: "/care/coordination", label: "Care coordination", icon: Workflow, roles: [L, A] },
      { href: "/therapist/records", label: "Clinical records", icon: FileText, roles: [C] },
      { href: "/therapist/assessments", label: "Assessments", icon: ClipboardList, roles: [C] },
      { href: "/therapist/plans", label: "Treatment plans", icon: Target, roles: [C] },
      { href: "/therapist/sessions", label: "My sessions", icon: CalendarCheck, roles: [C] },
      {
        href: "/therapist/documentation",
        label: "My documentation",
        icon: FileSignature,
        roles: [C],
      },
      { href: "/therapist/progress", label: "Progress and reports", icon: TrendingUp, roles: [C] },
      { href: "/therapist/ai", label: "AI assistants", icon: BotMessageSquare, roles: [C] },
      {
        href: "/therapist/coordination",
        label: "Tasks and coordination",
        icon: Workflow,
        roles: [C],
      },
      { href: "/care/reports", label: "Reports and analytics", icon: ChartColumn, roles: [L, A] },
      { href: "/care/ai-agent", label: "Operations agent", icon: BotMessageSquare, roles: [L, A] },
      { href: "/care/ai-oversight", label: "AI oversight", icon: BotMessageSquare, roles: [L, A] },
      { href: "/care/users", label: "User control", icon: UserCog, roles: [A] },
      { href: "/therapist/today", label: "Today", icon: Sun, roles: [C] },
      { href: "/therapist/patients", label: "Patients", icon: Contact, roles: [C] },
      { href: "/therapist/workspace", label: "My workspace", icon: Briefcase, roles: [C] },
      { href: "/therapist/tasks", label: "My tasks", icon: ListChecks, roles: [C] },
      { href: "/therapist/reports", label: "My reports", icon: ChartColumn, roles: [C] },
      { href: "/therapist/schedule", label: "My schedule", icon: CalendarRange, roles: [C] },
      { href: "/therapist", label: "My new patients", icon: BellRing, roles: [C] },
      { href: "/messages", label: "Messages", icon: MessagesSquare, roles: [C] },
      { href: "/care/messages", label: "Messages", icon: MessagesSquare, roles: [L, A] },
      { href: "/telehealth/recordings", label: "Recordings", icon: Video, roles: [L, A, C] },
      { href: "/profile", label: "My profile", icon: CircleUserRound, roles: [L, A, S, C] },
    ],
  },
  {
    group: "Intake & Admin",
    items: [
      { href: "/intake", label: "AI referrals", icon: FileInput, badge: 7, roles: [L, A] },
      { href: "/forms", label: "AI forms", icon: FormInput, roles: [L, A] },
    ],
  },
  {
    group: "Clinical",
    items: [
      { href: "/my-day", label: "My day", icon: CalendarDays, roles: [C] },
      { href: "/sessions/oliver-grant", label: "AI session note", icon: Mic, roles: [C] },
      { href: "/patients", label: "Patients", icon: Contact, roles: [L, A, S, C] },
      { href: "/schedule", label: "Schedule", icon: CalendarClock, roles: [L, A, S, C] },
      { href: "/telehealth", label: "Telehealth", icon: Video, roles: [L, S, C] },
      { href: "/caseloads/sarah-thompson", label: "Caseloads", icon: Briefcase, roles: [L, S] },
      { href: "/supervision/sarah-thompson", label: "AI briefs", icon: UserCheck, roles: [L, S] },
    ],
  },
  {
    group: "AI workspace",
    items: [
      {
        href: "/case-notes/mia-robinson",
        label: "AI notes",
        icon: FileText,
        badge: 5,
        roles: [L, S, C],
      },
      { href: "/reports", label: "AI reports", icon: ClipboardList, roles: [L, A, S, C] },
      { href: "/admin-insights", label: "Admin insights", icon: ChartPie, roles: [L] },
    ],
  },
  {
    group: "Platform",
    items: [
      { href: "/portal", label: "Family Portal", icon: Smartphone, roles: [L, C] },
      { href: "/settings", label: "Security & Integrations", icon: Lock, roles: [L] },
      { href: "/roadmap", label: "Roadmap", icon: MapIcon, roles: [L] },
    ],
  },
  {
    group: "Mobile apps",
    items: [
      { href: "/mobile/staff", label: "Admin app", icon: Tablet, roles: [L, A] },
      { href: "/mobile/family", label: "Family app", icon: Smartphone, roles: [L, C] },
      { href: "/mobile/patient", label: "Patient app", icon: Smartphone, roles: [L, A, C] },
      { href: "/mobile/therapist", label: "Therapist app", icon: Smartphone, roles: [L, A, C] },
    ],
  },
  {
    group: "Business",
    items: [
      { href: "/billing", label: "Billing and claims", icon: Receipt, roles: [L, A] },
      { href: "/hospital", label: "Hospital operations", icon: Hospital, roles: [L] },
      { href: "/erp", label: "ERP", icon: Building2, roles: [L] },
    ],
  },
];

/** An entry can rename a page for one role's menu, e.g. "Patients" for the clinical records. */
type Entry = string | { href: string; label: string; icon?: LucideIcon };
type Section = {
  group: string;
  hrefs: Entry[];
  live?: boolean;
  /** Folded until opened: the pages that are still there but not part of the everyday work. */
  more?: boolean;
};

const roleLayouts: Partial<Record<Role, Section[]>> = {
  Clinician: [
    // Seven everyday places. Everything else stays one click away under More.
    {
      group: "My work",
      live: true,
      hrefs: [
        "/therapist/today",
        { href: "/therapist/schedule", label: "Schedule" },
        "/therapist/patients",
        { href: "/therapist/documentation", label: "Notes", icon: FileText },
        { href: "/therapist/coordination", label: "Tasks", icon: ListChecks },
        "/messages",
        { href: "/therapist/progress", label: "Reports", icon: ChartColumn },
      ],
    },
    {
      group: "More",
      live: true,
      more: true,
      hrefs: [
        "/therapist/assessments",
        "/therapist/plans",
        "/therapist/ai",
        "/telehealth/recordings",
        "/mobile/therapist",
        "/mobile/patient",
      ],
    },
    { group: "My work", hrefs: ["/my-day", "/sessions/oliver-grant"] },
    { group: "AI workspace", hrefs: ["/case-notes/mia-robinson", "/reports"] },
    { group: "Clinical", hrefs: ["/patients", "/schedule", "/telehealth"] },
    { group: "Platform", hrefs: ["/portal"] },
    { group: "Mobile apps", hrefs: ["/mobile/family"] },
  ],
  Admin: [
    // The organisation dashboard, first in the menu: only a Super Admin opens it (see pageAccess).
    { group: "Dashboard", live: true, hrefs: ["/"] },
    { group: "Messages", live: true, hrefs: ["/care/messages"] },
    {
      group: "Patients",
      live: true,
      hrefs: ["/care", "/care/records", "/care/assessments", "/care/plans", "/care/progress"],
    },
    {
      group: "Therapists",
      live: true,
      hrefs: ["/care/therapists", "/care/sessions", "/care/coordination", "/telehealth/recordings"],
    },
    { group: "Scheduling", live: true, hrefs: ["/care/schedule"] },
    { group: "Finance", live: true, hrefs: ["/care/funding", "/care/billing"] },
    {
      group: "People and HR",
      live: true,
      hrefs: ["/care/hr", "/care/hr/leave", "/care/hr/timesheets"],
    },
    {
      group: "Work and AI",
      live: true,
      hrefs: ["/care/operations", "/care/reports", "/care/ai-oversight"],
    },
    { group: "Administration", live: true, hrefs: ["/care/users"] },
    {
      group: "Apps",
      live: true,
      hrefs: ["/mobile/staff", "/mobile/therapist", "/mobile/patient"],
    },
    { group: "Admin", hrefs: ["/intake", "/forms"] },
    { group: "Clinical", hrefs: ["/patients-requiring-attention", "/patients", "/schedule"] },
    { group: "AI workspace", hrefs: ["/reports"] },
    { group: "Business", hrefs: ["/billing"] },
  ],
  Supervisor: [
    {
      group: "AI workspace",
      hrefs: ["/supervision/sarah-thompson", "/case-notes/mia-robinson", "/reports"],
    },
    {
      group: "Team",
      hrefs: [
        "/team-capacity",
        "/caseloads/sarah-thompson",
        "/analytics",
        "/patients-requiring-attention",
      ],
    },
    { group: "Clinical", hrefs: ["/patients", "/schedule", "/telehealth"] },
  ],
};

/**
 * The sidebar for one role, with that person's main work first and split into sections. When a
 * signed-in admin's permissions are known, pages they cannot open are left out of the menu.
 */
export function navigationFor(
  role: Role,
  access?: PageAccess | null,
  { liveOnly = false }: { liveOnly?: boolean } = {},
) {
  const layout = roleLayouts[role];
  const items = navigation.flatMap((g) => g.items);
  const sections: { group: string; items: NavItem[]; live: boolean; more?: boolean }[] = layout
    ? layout.map(({ group, hrefs, live, more }) => ({
        group,
        live: Boolean(live),
        more: Boolean(more),
        items: hrefs
          .map((entry) => {
            const href = typeof entry === "string" ? entry : entry.href;
            const item = items.find((i) => i.href === href);
            return item && typeof entry !== "string"
              ? { ...item, label: entry.label, icon: entry.icon ?? item.icon }
              : item;
          })
          .filter((i): i is NavItem => i !== undefined),
      }))
    : navigation
        .map(({ group, items: list }) => ({
          group,
          live: group === "Live care",
          items: list.filter((i) => i.roles.includes(role)),
        }))
        .sort((a, b) => Number(b.live) - Number(a.live));
  const scoped = role === "Admin" ? access : null;
  return (
    sections
      // Signed-in people see the live product only; the sample screens stay for presenting.
      .filter((g) => !liveOnly || g.live)
      .map((g) => ({ ...g, items: g.items.filter((i) => canOpenPage(i.href, scoped)) }))
      .filter((g) => g.items.length > 0)
  );
}

/** Who the demo is signed in as in each role view. */
export const roleUsers: Record<Role, { name: string; initials: string; title: string }> = {
  Leadership: { name: "Neil Hensley", initials: "NH", title: "Director" },
  Admin: { name: "Jo Marsh", initials: "JM", title: "Administration" },
  Supervisor: { name: "Grace Liu", initials: "GL", title: "Senior OT & Clinical Supervisor" },
  Clinician: { name: "Sarah Thompson", initials: "ST", title: "Occupational Therapist" },
};

type RouteMeta = { section: string; page: string; role: Role };

const routes: { prefix: string; meta: RouteMeta }[] = [
  {
    prefix: "/telehealth/room",
    meta: { section: "My new patients", page: "Video visit", role: "Clinician" },
  },
  {
    prefix: "/telehealth/recordings",
    meta: { section: "Live care", page: "Recordings", role: "Clinician" },
  },
  {
    prefix: "/care/funding/agreements/",
    meta: { section: "Funding and agreements", page: "Service agreement", role: "Admin" },
  },
  {
    prefix: "/care/funding/",
    meta: { section: "Funding and agreements", page: "Participant funding", role: "Admin" },
  },
  {
    prefix: "/care/funding",
    meta: { section: "Live care", page: "Funding and agreements", role: "Admin" },
  },
  {
    prefix: "/care/billing/",
    meta: { section: "Billing", page: "Invoice", role: "Admin" },
  },
  {
    prefix: "/care/billing",
    meta: { section: "Live care", page: "Billing and finance", role: "Admin" },
  },
  {
    prefix: "/care/reports",
    meta: { section: "Live care", page: "Reports and analytics", role: "Admin" },
  },
  {
    prefix: "/care/ai-agent",
    meta: { section: "Live care", page: "Operations agent", role: "Admin" },
  },
  {
    prefix: "/care/hr/timesheets",
    meta: { section: "People and HR", page: "Timesheets", role: "Admin" },
  },
  {
    prefix: "/care/hr/leave",
    meta: { section: "People and HR", page: "Leave and absence", role: "Admin" },
  },
  {
    prefix: "/care/hr",
    meta: { section: "People and HR", page: "Credentials and compliance", role: "Admin" },
  },
  {
    prefix: "/care/users",
    meta: { section: "Administration", page: "User control", role: "Admin" },
  },
  {
    prefix: "/care/ai-oversight",
    meta: { section: "Live care", page: "AI oversight", role: "Admin" },
  },
  {
    prefix: "/care/coordination/",
    meta: { section: "Care coordination", page: "Task", role: "Admin" },
  },
  {
    prefix: "/care/coordination",
    meta: { section: "Live care", page: "Care coordination", role: "Admin" },
  },
  {
    prefix: "/therapist/coordination/",
    meta: { section: "Tasks", page: "Task", role: "Clinician" },
  },
  {
    prefix: "/therapist/coordination",
    meta: { section: "My work", page: "Tasks", role: "Clinician" },
  },
  {
    prefix: "/care/progress/reports/",
    meta: { section: "Progress and reports", page: "Clinical report", role: "Admin" },
  },
  {
    prefix: "/care/progress/",
    meta: { section: "Progress and reports", page: "Course of care progress", role: "Admin" },
  },
  {
    prefix: "/care/progress",
    meta: { section: "Live care", page: "Progress and reports", role: "Admin" },
  },
  {
    prefix: "/therapist/progress/reports/",
    meta: { section: "Progress and reports", page: "Clinical report", role: "Clinician" },
  },
  {
    prefix: "/therapist/progress/",
    meta: { section: "Progress and reports", page: "Course of care progress", role: "Clinician" },
  },
  {
    prefix: "/therapist/progress",
    meta: { section: "Live care", page: "Progress and reports", role: "Clinician" },
  },
  {
    prefix: "/therapist/ai",
    meta: { section: "Live care", page: "AI assistants", role: "Clinician" },
  },
  {
    prefix: "/care/documentation/",
    meta: { section: "Sessions and notes", page: "Clinical note", role: "Admin" },
  },
  {
    prefix: "/care/documentation",
    meta: { section: "Live care", page: "Sessions and notes", role: "Admin" },
  },
  {
    prefix: "/therapist/documentation/",
    meta: { section: "My documentation", page: "Clinical note", role: "Clinician" },
  },
  {
    prefix: "/therapist/documentation",
    meta: { section: "My work", page: "Notes", role: "Clinician" },
  },
  {
    prefix: "/care/sessions/",
    meta: { section: "Sessions and notes", page: "Session", role: "Admin" },
  },
  {
    prefix: "/care/sessions",
    meta: { section: "Live care", page: "Sessions and notes", role: "Admin" },
  },
  {
    prefix: "/therapist/sessions/",
    meta: { section: "My sessions", page: "Session", role: "Clinician" },
  },
  {
    prefix: "/therapist/sessions",
    meta: { section: "Live care", page: "My sessions", role: "Clinician" },
  },
  {
    prefix: "/care/plans/",
    meta: { section: "Treatment plans", page: "Treatment plan", role: "Admin" },
  },
  {
    prefix: "/care/plans",
    meta: { section: "Live care", page: "Treatment plans", role: "Admin" },
  },
  {
    prefix: "/therapist/plans/",
    meta: { section: "Treatment plans", page: "Treatment plan", role: "Clinician" },
  },
  {
    prefix: "/therapist/plans",
    meta: { section: "Live care", page: "Treatment plans", role: "Clinician" },
  },
  {
    prefix: "/care/assessments/",
    meta: { section: "Assessments", page: "Assessment", role: "Admin" },
  },
  {
    prefix: "/care/assessments",
    meta: { section: "Live care", page: "Assessments", role: "Admin" },
  },
  {
    prefix: "/care/records/",
    meta: { section: "Clinical records", page: "Record", role: "Admin" },
  },
  {
    prefix: "/care/records",
    meta: { section: "Live care", page: "Clinical records", role: "Admin" },
  },
  {
    prefix: "/therapist/records/",
    meta: { section: "Clinical records", page: "Record", role: "Clinician" },
  },
  {
    prefix: "/therapist/records",
    meta: { section: "Live care", page: "Clinical records", role: "Clinician" },
  },
  {
    prefix: "/care/operations/tasks/",
    meta: { section: "Work and approvals", page: "Task", role: "Admin" },
  },
  {
    prefix: "/care/operations/rules/",
    meta: { section: "Work and approvals", page: "Workflow rule", role: "Admin" },
  },
  {
    prefix: "/care/operations",
    meta: { section: "Live care", page: "Work and approvals", role: "Admin" },
  },
  {
    prefix: "/therapist/reports",
    meta: { section: "Live care", page: "My reports", role: "Clinician" },
  },
  {
    prefix: "/therapist/workspace",
    meta: { section: "Live care", page: "My workspace", role: "Clinician" },
  },
  {
    prefix: "/therapist/tasks",
    meta: { section: "Live care", page: "My tasks", role: "Clinician" },
  },
  {
    prefix: "/therapist/assessments/",
    meta: { section: "Assessments", page: "Assessment", role: "Clinician" },
  },
  {
    prefix: "/therapist/assessments",
    meta: { section: "Live care", page: "Assessments", role: "Clinician" },
  },
  {
    prefix: "/therapist/patients/",
    meta: { section: "Patients", page: "Patient", role: "Clinician" },
  },
  {
    prefix: "/therapist/patients",
    meta: { section: "My work", page: "Patients", role: "Clinician" },
  },
  {
    prefix: "/therapist/schedule",
    meta: { section: "Live care", page: "My schedule", role: "Clinician" },
  },
  {
    prefix: "/care/schedule",
    meta: { section: "Live care", page: "Scheduling", role: "Admin" },
  },
  {
    prefix: "/care/therapists",
    meta: { section: "Therapists", page: "Therapists", role: "Admin" },
  },
  { prefix: "/assistant", meta: { section: "AI", page: "Ask Medisense AI", role: "Admin" } },
  { prefix: "/profile", meta: { section: "Live care", page: "My profile", role: "Clinician" } },
  {
    prefix: "/care/new",
    meta: { section: "Patients", page: "Enter a referral", role: "Admin" },
  },
  {
    prefix: "/care/referrals/",
    meta: { section: "Patients", page: "Referral", role: "Admin" },
  },
  {
    prefix: "/care/referrals",
    meta: { section: "Live care", page: "Referrals and intake", role: "Admin" },
  },
  { prefix: "/care/messages", meta: { section: "Live care", page: "Messages", role: "Admin" } },
  { prefix: "/care/", meta: { section: "Patients", page: "Patient", role: "Admin" } },
  { prefix: "/care", meta: { section: "Live care", page: "Patients", role: "Admin" } },
  { prefix: "/therapist/today", meta: { section: "My work", page: "Today", role: "Clinician" } },
  {
    prefix: "/therapist",
    meta: { section: "Live care", page: "My new patients", role: "Clinician" },
  },
  { prefix: "/messages", meta: { section: "Live care", page: "Messages", role: "Clinician" } },
  { prefix: "/sessions", meta: { section: "AI notes", page: "Oliver Grant", role: "Clinician" } },
  { prefix: "/admin-queue", meta: { section: "Admin", page: "Work queue", role: "Admin" } },
  {
    prefix: "/before-after",
    meta: { section: "Organisation", page: "Before and after", role: "Leadership" },
  },
  {
    prefix: "/since-yesterday",
    meta: { section: "Organisation", page: "Since yesterday", role: "Leadership" },
  },
  { prefix: "/telehealth", meta: { section: "Clinical", page: "Telehealth", role: "Clinician" } },
  { prefix: "/billing", meta: { section: "Business", page: "Billing and claims", role: "Admin" } },
  {
    prefix: "/hospital",
    meta: { section: "Business", page: "Hospital operations", role: "Leadership" },
  },
  { prefix: "/erp", meta: { section: "Business", page: "ERP", role: "Leadership" } },
  { prefix: "/roadmap", meta: { section: "Platform", page: "Roadmap", role: "Leadership" } },
  {
    prefix: "/intake",
    meta: { section: "Intake & Admin", page: "AI referrals", role: "Admin" },
  },
  { prefix: "/forms", meta: { section: "Intake & Admin", page: "AI forms", role: "Admin" } },
  { prefix: "/tasks", meta: { section: "Intake & Admin", page: "Tasks", role: "Admin" } },
  {
    prefix: "/admin-operations",
    meta: { section: "Intake & Admin", page: "Admin Operations", role: "Admin" },
  },
  {
    prefix: "/automations",
    meta: { section: "Intake & Admin", page: "Automations", role: "Leadership" },
  },
  { prefix: "/schedule", meta: { section: "Clinical", page: "Schedule", role: "Admin" } },
  { prefix: "/reports", meta: { section: "AI workspace", page: "AI reports", role: "Clinician" } },
  {
    prefix: "/analytics",
    meta: { section: "Organisation", page: "AI insights", role: "Leadership" },
  },
  { prefix: "/portal", meta: { section: "Platform", page: "Family Portal", role: "Leadership" } },
  {
    prefix: "/settings",
    meta: { section: "Platform", page: "Security & Integrations", role: "Leadership" },
  },
  {
    prefix: "/team-capacity",
    meta: { section: "Organisation", page: "Team capacity", role: "Leadership" },
  },
  {
    prefix: "/patients-requiring-attention",
    meta: { section: "Organisation", page: "Patients to review", role: "Leadership" },
  },
  {
    prefix: "/caseloads",
    meta: { section: "Clinical · Caseloads", page: "Sarah Thompson", role: "Leadership" },
  },
  {
    prefix: "/supervision",
    meta: { section: "AI briefs", page: "Sarah Thompson", role: "Supervisor" },
  },
  { prefix: "/my-day", meta: { section: "My work", page: "My day", role: "Clinician" } },
  {
    prefix: "/case-notes",
    meta: { section: "AI workspace", page: "AI notes", role: "Clinician" },
  },
  {
    prefix: "/progress-reports",
    meta: { section: "AI Workspace · Progress Reports", page: "Emily Carter", role: "Clinician" },
  },
  {
    prefix: "/admin-insights",
    meta: { section: "AI Workspace", page: "Admin Insights", role: "Leadership" },
  },
  // Last, so "/clients-requiring-attention" matches its own entry first.
  {
    prefix: "/patients/",
    meta: { section: "Clinical · Patients", page: "Patient profile", role: "Clinician" },
  },
  { prefix: "/patients", meta: { section: "Clinical", page: "Patients", role: "Leadership" } },
];

const overview: RouteMeta = { section: "Organisation", page: "Dashboard", role: "Leadership" };

export function routeMeta(pathname: string): RouteMeta {
  return routes.find((r) => pathname.startsWith(r.prefix))?.meta ?? overview;
}

/** Screens that stand alone, without the staff sidebar and top bar. */
export { isStandalone } from "./standalone";

/** Detail pages that belong to a differently named sidebar entry. */
const activeAliases: Record<string, string[]> = { "/reports": ["/progress-reports"] };

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  const hrefs = navigation.flatMap((g) => g.items.map((i) => i.href));
  const section = href.split("/").slice(0, 2).join("/");
  // Single-record entries (e.g. /sessions/oliver-grant) light up for their whole section, unless
  // another entry shares that section; then each entry matches its own address only.
  const shared = hrefs.some((h) => h !== href && h.split("/").slice(0, 2).join("/") === section);
  const own = shared ? href : section;
  const inSection = [own, ...(shared ? [] : (activeAliases[section] ?? []))].some((p) =>
    under(pathname, p),
  );
  if (!inSection) return false;
  // A more specific entry wins, so "/care/therapists" doesn't also light up "/care".
  return !hrefs.some((h) => h !== href && h.startsWith(`${href}/`) && under(pathname, h));
}

export const roleHome: Record<Role, string> = {
  Leadership: "/",
  Admin: "/admin-queue",
  Supervisor: "/supervision/sarah-thompson",
  Clinician: "/my-day",
};
