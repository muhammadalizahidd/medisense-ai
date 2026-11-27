import type { Discipline } from "./catalogue";

/** Every visit of one therapy type, with the patient's details and where it happened. */
const therapyVisitColumns = [
  "Date",
  "Start",
  "Patient",
  "MRN",
  "Date of birth",
  "Phone",
  "Funding",
  "Appointment type",
  "Address",
  "Therapist",
  "Purpose",
  "Status",
  "Booked minutes",
  "Actual minutes",
  "Note",
] as const;

/** One therapy type's visit report; the id keeps its literal type for the report maps. */
const therapyReport = <I extends string>(id: I, therapyType: Discipline, title: string) => ({
  id,
  group: "Therapy types" as const,
  title: `${title} Report`,
  description: `Every ${title.toLowerCase()} session with the patient, setting, therapist, status and time.`,
  therapyType,
  columns: therapyVisitColumns,
  permission: "reports.detail.scheduling" as const,
  totals: ["Booked minutes", "Actual minutes"] as const,
});

/**
 * System reports: plain downloadable tables straight from the live records, no charts. Shared by
 * the System reports tab and the download route, so both agree on what each report holds and who
 * may download it.
 */

export const systemReports = [
  {
    id: "by-patient",
    group: "Patients",
    title: "Patient Activity Report",
    description: "One row per patient: visits completed, cancelled and missed, and time given.",
    columns: [
      "MRN",
      "Patient",
      "Funding",
      "Suburb",
      "Visits",
      "Completed",
      "Cancelled",
      "Did not attend",
      "Booked",
      "Hours given",
      "Therapists",
      "First visit",
      "Last visit",
    ],
    permission: "reports.detail.participants",
    totals: ["Visits", "Completed", "Hours given"],
  },
  {
    id: "patients",
    group: "Patients",
    title: "Patient Register Report",
    description: "Every patient with their details, funding, status and therapists.",
    columns: [
      "MRN",
      "Patient",
      "Date of birth",
      "Phone",
      "Email",
      "Suburb",
      "Region",
      "Funding",
      "Status",
      "Therapists",
      "Added",
    ],
    permission: "reports.detail.participants",
    totals: [],
  },
  {
    id: "by-therapist",
    group: "Therapists",
    title: "Therapist Activity Report",
    description: "One row per therapist: patients seen, visits and hours delivered.",
    columns: [
      "Therapist",
      "Therapy type",
      "Region",
      "Patients seen",
      "Visits",
      "Completed",
      "Cancelled",
      "Did not attend",
      "Booked",
      "Hours delivered",
      "Average minutes per visit",
      "Completion rate",
    ],
    permission: "reports.detail.staff",
    totals: ["Visits", "Completed", "Hours delivered"],
  },
  {
    id: "patient-therapist",
    group: "Therapists",
    title: "Therapist and Patient Hours Report",
    description: "Which therapist saw which patient, how many visits and how much time.",
    columns: [
      "Therapist",
      "Therapy type",
      "MRN",
      "Patient",
      "Visits completed",
      "Minutes",
      "Hours",
      "First visit",
      "Last visit",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Visits completed", "Hours"],
  },
  {
    id: "caseload",
    group: "Therapists",
    title: "Therapist Caseload Report",
    description: "Active patients against capacity and the caseload score for each therapist.",
    columns: [
      "Therapist",
      "Therapy type",
      "Region",
      "Seniority",
      "Active patients",
      "Capacity",
      "Free places",
      "Caseload score",
      "Status",
    ],
    permission: "reports.detail.staff",
    totals: ["Active patients", "Capacity", "Free places"],
  },
  {
    id: "visits",
    group: "Visits",
    title: "Visit Register Report",
    description: "Every visit in the period: date, patient, therapist, status, time and note.",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Therapist",
      "Therapy type",
      "Type",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "missed",
    group: "Visits",
    title: "Cancellation and Did Not Attend Report",
    description: "Visits that didn't go ahead, with who cancelled and why.",
    columns: ["Date", "Start", "Patient", "MRN", "Therapist", "Status", "Reason"],
    permission: "reports.detail.scheduling",
    totals: [],
  },
  {
    id: "by-day",
    group: "Visits",
    title: "Daily Visit Activity Report",
    description: "One row per day: visits booked, completed, cancelled and hours delivered.",
    columns: [
      "Date",
      "Day",
      "Visits",
      "Completed",
      "Cancelled",
      "Did not attend",
      "Hours delivered",
      "Patients seen",
      "Therapists working",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Visits", "Completed", "Hours delivered"],
  },
  {
    id: "by-type",
    group: "Appointment types",
    title: "Appointment Type Summary Report",
    description: "Home visits, telehealth, school and other settings: visits, hours and patients.",
    columns: [
      "Appointment type",
      "Visits",
      "Completed",
      "Cancelled",
      "Did not attend",
      "Booked",
      "Hours delivered",
      "Patients seen",
      "Therapists",
      "Completion rate",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Visits", "Completed", "Hours delivered"],
  },
  {
    id: "type-home",
    group: "Appointment types",
    title: "Home Visit Report",
    description: "Every home visit with the patient, address, therapist, status and time.",
    appointmentType: "Home",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Therapy type",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "type-telehealth",
    group: "Appointment types",
    title: "Telehealth Appointment Report",
    description: "Every telehealth appointment with the patient, therapist, status and time.",
    appointmentType: "Telehealth",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Therapy type",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "type-school",
    group: "Appointment types",
    title: "School Visit Report",
    description: "Every school visit with the patient, school address, therapist, status and time.",
    appointmentType: "School",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Therapy type",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "type-daycare",
    group: "Appointment types",
    title: "Daycare Visit Report",
    description: "Every daycare visit with the patient, address, therapist, status and time.",
    appointmentType: "Daycare",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Therapy type",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "type-day-program",
    group: "Appointment types",
    title: "Day Program Visit Report",
    description: "Every day program visit with the patient, address, therapist, status and time.",
    appointmentType: "Day Program",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Therapy type",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "type-community",
    group: "Appointment types",
    title: "Community Visit Report",
    description: "Every community visit with the patient, address, therapist, status and time.",
    appointmentType: "Community",
    columns: [
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Therapy type",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
  {
    id: "by-therapy",
    group: "Therapy types",
    title: "Therapy Service Summary Report",
    description:
      "Each therapy's visits by visit type: home, telehealth, school, daycare, day program and community.",
    columns: [
      "Therapy type",
      "Visits",
      "Home visits",
      "Telehealth",
      "School visits",
      "Daycare visits",
      "Day Program visits",
      "Community visits",
      "Completion rate",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Visits", "Home visits", "Telehealth"],
  },
  therapyReport("therapy-ot", "Occupational Therapy", "Occupational Therapy"),
  therapyReport("therapy-physio", "Physiotherapy", "Physiotherapy"),
  therapyReport("therapy-speech", "Speech Pathology", "Speech Pathology"),
  therapyReport("therapy-ep", "Exercise Physiology", "Exercise Physiology"),
  therapyReport("therapy-psychology", "Psychology", "Psychology"),
  therapyReport("therapy-trauma", "Trauma Therapy", "Trauma Therapy"),
  therapyReport("therapy-dietetics", "Dietetics", "Dietetics"),
  therapyReport("therapy-podiatry", "Podiatry", "Podiatry"),
  therapyReport("therapy-nursing", "Nursing", "Nursing"),
] as const;

export type SystemReport = (typeof systemReports)[number];

/** One report worked out on the server: the table the preview, the PDF and the CSV all show. */
export type SystemReportTable = {
  id: SystemReportId;
  title: string;
  description: string;
  /** "1 Nov 2026 to 30 Nov 2026", or "All time". */
  period: string;
  /** "All appointment types", or the one type the report was cut to. */
  type: string;
  generatedAt: string;
  /** The one therapy type a per-therapy report covers, else "". */
  therapy: string;
  /** Which request this answers (report and filters), so a screen can tell a stale answer. */
  request: string;
  /** The filters in words: "Brisbane North · Occupational Therapy", or "No other filters". */
  filters: string;
  /**
   * `strong` marks the columns people scan by: MRN, patient, therapist, funding.
   * `percent` values are percentages (0–100).
   */
  columns: { label: string; numeric: boolean; strong: boolean; percent: boolean }[];
  rows: (string | number)[][];
  /** The Total row: sums where adding up makes sense, blanks elsewhere. Null when it wouldn't help. */
  footer: (string | number)[] | null;
  /** Headline figures: the row count, then the sum of each total column. */
  totals: { label: string; value: string }[];
  /** Visit figures for the chosen period and filters, with the period just before for comparison. */
  summary: { current: VisitSummary; previous: VisitSummary | null };
  /** What each filter can be set to, from the live records. */
  options: {
    regions: string[];
    disciplines: string[];
    therapists: { id: string; name: string }[];
  };
};

export type VisitSummary = {
  visits: number;
  completed: number;
  cancelled: number;
  booked: number;
  hours: number;
};
export type SystemReportId = SystemReport["id"];

/** The order the reports list shows its groups: appointment types first. */
export const systemReportGroups = [
  "Appointment types",
  "Therapy types",
  "Patients",
  "Therapists",
  "Visits",
] as const;

/**
 * Where and how a visit happens, worked out the same way as the rest of reports: telehealth first,
 * otherwise the visit's site, otherwise the location the referral asked for.
 */
export const appointmentTypes = [
  "Home",
  "Telehealth",
  "School",
  "Daycare",
  "Day Program",
  "Community",
] as const;
export type AppointmentType = (typeof appointmentTypes)[number];

export const isAppointmentType = (v: string | null | undefined): v is AppointmentType =>
  (appointmentTypes as readonly string[]).includes(v ?? "");

/** "Home visits", "Telehealth", "School visits"; "All appointment types" when none is chosen. */
export const typeLabel = (type: string) =>
  !isAppointmentType(type)
    ? "All appointment types"
    : type === "Telehealth"
      ? "Telehealth"
      : `${type} visits`;

export const systemReportById = (id: string) => systemReports.find((r) => r.id === id) ?? null;

/** Each report group has its own page, which the Reports menu links to. */
export const systemReportSlugs = {
  "Appointment types": "types",
  "Therapy types": "therapy",
  Patients: "patients",
  Therapists: "therapists",
  Visits: "visits",
} as const satisfies Record<(typeof systemReportGroups)[number], string>;
export type SystemReportSlug = (typeof systemReportSlugs)[keyof typeof systemReportSlugs];

export const groupForSlug = (slug: string) =>
  systemReportGroups.find((g) => systemReportSlugs[g] === slug) ?? null;

/** Visit outcomes the Status filter offers. Booked covers tentative bookings too. */
export const visitStatusFilters = [
  { id: "completed", label: "Completed" },
  { id: "booked", label: "Booked" },
  { id: "cancelled", label: "Cancelled" },
  { id: "dna", label: "Did not attend" },
  { id: "incomplete", label: "Incomplete" },
] as const;
export type VisitStatusFilter = (typeof visitStatusFilters)[number]["id"];

/** Everything a report can be cut by. Empty strings mean "all". Dates are Brisbane days. */
export type SystemReportFilters = {
  from: string;
  to: string;
  region: string;
  discipline: string;
  therapist: string;
  status: string;
};

export type SystemReportFormat = "json" | "csv" | "pdf";

/** The address of one report: the preview (json), or a download as PDF or CSV (opens in Excel). */
export const systemReportUrl = (
  id: SystemReportId,
  f: SystemReportFilters,
  format: SystemReportFormat = "json",
) => {
  const q = new URLSearchParams({ report: id, format });
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  return `/api/care/reports/system?${q.toString()}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const readable = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d ?? 1} ${MONTHS[(m ?? 1) - 1] ?? ""} ${y ?? ""}`;
};

/** The period in words, the same on screen, in the PDF and in the audit trail. */
export function periodLabel(from: string, to: string) {
  if (from && to) return from === to ? readable(from) : `${readable(from)} to ${readable(to)}`;
  if (from) return `From ${readable(from)}`;
  if (to) return `Up to ${readable(to)}`;
  return "All time";
}
