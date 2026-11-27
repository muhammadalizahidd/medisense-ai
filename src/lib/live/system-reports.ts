/**
 * System reports: plain downloadable tables straight from the live records, no charts. Shared by
 * the System reports tab and the download route, so both agree on what each report holds and who
 * may download it.
 */

export const systemReports = [
  {
    id: "by-patient",
    group: "Patients",
    title: "Visits by patient",
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
    title: "Patient list",
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
    title: "Visits by therapist",
    description: "One row per therapist: patients seen, visits and hours delivered.",
    columns: [
      "Therapist",
      "Discipline",
      "Region",
      "Patients seen",
      "Visits",
      "Completed",
      "Cancelled",
      "Did not attend",
      "Booked",
      "Hours delivered",
      "Average minutes per visit",
    ],
    permission: "reports.detail.staff",
    totals: ["Visits", "Completed", "Hours delivered"],
  },
  {
    id: "patient-therapist",
    group: "Therapists",
    title: "Patient and therapist time",
    description: "Which therapist saw which patient, how many visits and how much time.",
    columns: [
      "Therapist",
      "Discipline",
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
    title: "Therapist caseload",
    description: "Active patients against capacity and the caseload score for each therapist.",
    columns: [
      "Therapist",
      "Discipline",
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
    title: "All visits",
    description: "Every visit in the period: date, patient, therapist, status, time and note.",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Therapist",
      "Discipline",
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
    title: "Cancellations and did not attend",
    description: "Visits that didn't go ahead, with who cancelled and why.",
    columns: ["Reference", "Date", "Start", "Patient", "MRN", "Therapist", "Status", "Reason"],
    permission: "reports.detail.scheduling",
    totals: [],
  },
  {
    id: "by-day",
    group: "Visits",
    title: "Visits by day",
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
    title: "Visits by appointment type",
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
    ],
    permission: "reports.detail.scheduling",
    totals: ["Visits", "Completed", "Hours delivered"],
  },
  {
    id: "type-home",
    group: "Appointment types",
    title: "Home visits",
    description: "Every home visit with the patient, address, therapist, status and time.",
    appointmentType: "Home",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Discipline",
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
    title: "Telehealth appointments",
    description: "Every telehealth appointment with the patient, therapist, status and time.",
    appointmentType: "Telehealth",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Discipline",
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
    title: "School visits",
    description: "Every school visit with the patient, school address, therapist, status and time.",
    appointmentType: "School",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Discipline",
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
    title: "Daycare visits",
    description: "Every daycare visit with the patient, address, therapist, status and time.",
    appointmentType: "Daycare",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Discipline",
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
    title: "Day program visits",
    description: "Every day program visit with the patient, address, therapist, status and time.",
    appointmentType: "Day Program",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Discipline",
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
    title: "Community visits",
    description: "Every community visit with the patient, address, therapist, status and time.",
    appointmentType: "Community",
    columns: [
      "Reference",
      "Date",
      "Start",
      "Patient",
      "MRN",
      "Date of birth",
      "Phone",
      "Funding",
      "Address",
      "Therapist",
      "Discipline",
      "Purpose",
      "Status",
      "Booked minutes",
      "Actual minutes",
      "Note",
    ],
    permission: "reports.detail.scheduling",
    totals: ["Booked minutes", "Actual minutes"],
  },
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
  columns: { label: string; numeric: boolean }[];
  rows: (string | number)[][];
  /** Headline figures: the row count, then the sum of each total column. */
  totals: { label: string; value: string }[];
};
export type SystemReportId = SystemReport["id"];

/** The order the reports list shows its groups: appointment types first. */
export const systemReportGroups = [
  "Appointment types",
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

export type SystemReportFormat = "json" | "csv" | "pdf";

/** The address of one report: the preview (json), or a download as PDF or CSV (opens in Excel). */
export const systemReportUrl = (
  id: SystemReportId,
  from: string,
  to: string,
  format: SystemReportFormat = "json",
  type = "",
) =>
  `/api/care/reports/system?${new URLSearchParams({ report: id, from, to, type, format }).toString()}`;

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
