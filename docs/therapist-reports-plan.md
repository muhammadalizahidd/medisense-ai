# Therapist reporting: plan

Status: built, except the therapist PDF report (CSV of the patient list only) and a per-therapist scheduled report. Decisions: caseload and appointments are shown separately and combined (section 10); the other decisions follow the recommendations in section 9. Two surfaces, one design: a therapist's own **Progress and reports** panel, and a **Therapist reports** section for the Super Admin that opens the same panel for any therapist. Same look and structure as the redesigned Reports section: an Overview dashboard, area tabs with a short summary each, and dialogs for everything deeper.

## 1. What exists today

- **A therapist already has two pages**, and neither answers "how is my caseload doing?":
  - `/therapist/progress` is the clinical progress module: episodes, the report centre and the approval queue (`progress-hub.tsx`). It is documents, not figures.
  - `/therapist/reports` renders the *organisation* reports hub with a fixed scope (staff, scheduling, clinical operations, telehealth) filtered to the therapist's own appointments, assessments and plans (`loadFacts` in `src/server/reports.ts`). It is not in the therapist's menu.
- **There is no patient view of the figures.** The therapist scope has no participants domain, so the patient and service facts are never loaded for them. "How many patients do I have?" can't be answered, and nothing can be filtered by patient.
- **The Super Admin has no per-therapist report.** The therapist profile (`/care/therapists/[id]`) shows the person and their caseload score, not their reports.
- **Pieces we can reuse:** `ReportFacts` (appointments, assessments, goal reviews, plans, participants, services, tasks), the metric catalogue, the redesigned area/overview/dialog components, the PDF library, and the permission system.

## 2. What a therapist needs to see

Written for a clinician, in plain words, about their own work.

| Area (tab) | Headline figures | Needs attention |
|---|---|---|
| **Overview** | Active patients, sessions delivered, attendance rate, notes to sign, goals on track, utilisation | The five things to do first |
| **My patients** | Active, new this period, discharged, seen in the period; by funding type | Patients not seen in 30 days; patients with no next visit |
| **Sessions** | Delivered, cancelled (by the patient, by us), did not attend, late cancellations, average per patient, telehealth share | Sessions without a note |
| **Notes and documentation** | Notes to sign, overdue, signed on time; reports due | Overdue notes, oldest first |
| **Goals and progress** | Goals on track, achieved, reviews due; progress by patient | Reviews overdue; no progress recorded |
| **Assessments and plans** | Open assessments, turnaround, plans due for review, plans active | Reviews due this fortnight |
| **Time and travel** | Utilisation, booked and delivered hours, travel booked vs recorded | Weeks over capacity |
| **Clinical reports** | The existing episodes, reports and approvals, as a dialog | Reports awaiting your sign-off |

Money is never shown to a therapist. Only their own patients appear.

## 3. Filtering by patient

A **Patient** filter in the Filters dialog, shown as a chip in the header. Choosing a patient:
- narrows every tile, chart and table to that patient;
- opens a **Patient summary** dialog from any patient row: sessions and attendance, goals and progress, notes status, next appointment, documents, with a link to the real record.

The list only ever contains the therapist's own patients, and the server enforces it, not the picker.

## 4. The Super Admin section

A **Therapists** entry in Reports (and a **Reports** button on each therapist profile):

1. **Picker:** search by name, discipline or region. Each row shows caseload, sessions delivered, attendance and notes overdue, as neutral figures. It is a way to choose, not a league table.
2. **Open a therapist:** the identical hub loads for that therapist, with a banner "Viewing Emma Clarke's reports" and a back link to the picker. Every tab, filter, dialog and download works the same way.
3. **Access:** a new permission, **View therapist reports**, held by the Super Admin always and given to roles such as Clinical Lead and Operations Manager by default. Patient-level detail follows the existing clinical-detail permission.
4. **Audit:** opening a therapist's reports writes an audit entry (who, which therapist, when), because it exposes patient information.

## 5. Design (same as the redesigned reports)

- **Shell:** header with period, Filters (including Patient), Download, and a Create a report button limited to the therapist's areas. Tabs as in section 2.
- **Overview:** six tiles; one activity chart (sessions delivered or patients seen, with a switch); **Needs attention** list; **Patients at a glance**, a short table (name, last seen, next visit, goal progress, note status) with "See all patients"; recent downloads.
- **Area tabs:** one sentence ("12 sessions delivered this fortnight, 2 cancelled"), up to four tiles, one chart, **Open the full report** and **Download**.
- **Dialogs, not pages:** full report, patient summary, filters, downloads and the clinical reports module all open as large closable dialogs. The existing episode and clinical report editors stay full pages because they are documents being written.
- **Tone:** plain language, tasks first ("5 notes to sign"), every figure links to the records behind it, status always has a word and never colour alone.
- **Therapist menu:** "Progress and reports" becomes this hub, with the old module inside it as the **Clinical reports** tab.

## 6. How it is built

The calculation stays in pure, tested code; the screens reuse the redesigned reports components.

| Phase | Work | Files |
|---|---|---|
| 1. Scope and permission | Add the `reports.therapist` permission; a `subject` therapist for the report load; therapist viewers can only ever load themselves | `src/lib/permissions/catalogue.ts`, `src/server/therapist-reports.ts` |
| 2. Caseload facts | Load participants and services for the subject therapist **at query level**, never all clients then filter; keep patient names only where the viewer may see them | `src/server/reports.ts` or the new server file |
| 3. Measures | The therapist metrics and `patientRows()` / `patientSummary()` as pure functions over `ReportFacts` | `src/lib/live/therapist-reports.ts` + tests |
| 4. Patient filter | Add `patient` to `ReportFilters` and `scoped()`, to the Filters dialog and the summary chips | `src/lib/live/reports.ts`, `reports-bits.tsx` |
| 5. API | `GET /api/care/reports/therapist` (the therapist's own) and `/therapist/[id]` (permission checked, audited) | `src/app/api/care/reports/therapist/` |
| 6. Screens | Make the area, overview and dialog components take their areas as data, then add the therapist areas, Overview, Patients table and Patient summary | `reports-areas.tsx`, new `therapist-reports-hub.tsx`, `patient-summary-dialog.tsx` |
| 7. Super Admin | The Therapists picker page, the viewer banner, the profile button | `src/app/care/reports/therapists/`, `staff-profile.tsx` |
| 8. Downloads | A therapist report PDF (title with the therapist's name, tiles, patients table) and CSV of the patients table, using the PDF library | `src/lib/pdf/documents/therapist-report.tsx` |
| 9. Menus and checks | Therapist menu entry, permission wiring and route tests, browser pass at desktop and phone | `navigation.ts`, tests |

## 7. Testing

- **Isolation:** a therapist's facts contain only their own patients, appointments, assessments and plans; asking for another therapist's id returns 403.
- **Permission:** an admin without View therapist reports gets 403; with it, 200 and an audit entry; patient-level detail needs the clinical-detail permission.
- **Measures:** each metric and the patient rows against small fixtures, including zero patients, a discharged patient and a patient with no visits.
- **Patient filter:** every area narrows to the chosen patient, and a patient outside the caseload is rejected.
- **Consistency:** "Active patients" equals the caseload shown on the therapist's profile and directory, from one shared function.
- **PDF:** the therapist report renders with the right name and figures.

## 8. Risks

- **Defining caseload.** Today a patient belongs to a therapist through a service ("need") assigned to them. Appointments in the period may include patients whose service has moved on. The plan counts **active services assigned to the therapist**, and shows "seen in the period" separately, so the two are never confused.
- **Privacy.** The Super Admin view exposes patient information, so it is permission-gated, audited and respects the clinical-detail permission.
- **Performance.** Loading the whole client list to filter in memory would be slow and a leak risk; the load must filter in the database.
- **Number agreement.** The same figure must read the same on the profile, the directory and the report, so it comes from one function.

## 9. Decisions to confirm

1. **Caseload definition:** active services assigned to the therapist (recommended), or any patient with an appointment in the period.
2. **Where it lives:** replace `/therapist/progress` with the new hub and keep the old module as its Clinical reports tab (recommended), or keep both pages and add the hub at `/therapist/reports`.
3. **Who sees therapist reports besides the Super Admin:** Clinical Lead and Operations Manager by default (recommended), or the Super Admin only until it is switched on per role.
4. **The comparison picker:** keep the neutral figures beside each therapist (recommended), or show names only.
5. **Patient filter:** one patient at a time (recommended), or several.

## 10. Caseload and appointments, decided

A therapist thinks about two different groups of people, so the report keeps them apart and lets them be combined.

- **On my caseload**: patients with a service assigned to the therapist that is not closed. This is who the therapist is responsible for, whether or not they were seen.
- **Seen in the period**: patients who had a delivered session in the period, including cover for a colleague.
- **Both**: everyone in either group.

The My patients tab opens with both counts side by side, plus the two gaps a clinician acts on: **on the caseload but not seen**, and **seen but not on the caseload**. A **Patients shown** switch (My caseload, Seen in the period, Both) controls the patient list and its charts, and each patient carries a plain tag saying how they relate to the therapist. Sessions, attendance and time are always about appointments.
