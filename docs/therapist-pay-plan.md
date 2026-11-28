# Therapist pay and earnings: implementation plan

Source: "Task: Therapist pay and earnings" (Parts A, B, C, rules and edge cases, done-when list).
Branch: `feat/therapist-pay` from `main`.

## 1. How it fits what already exists

| Need                     | What is there today                                                                                                                                   | What we build on it                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Completed visits         | `appointments` (`AppointmentDoc`): `status`, `start`, `end`, `modality`, `checkOut.minutes`, `note.status`                                            | The visit is the unit of pay                   |
| Note signed              | `note.status` is `"Final"` or `"Amended"`; signing calls `billVisit()` in `src/server/clinical.ts`                                                    | Earned = completed + signed                    |
| What was billed          | `billables` (`BillableDoc`), one per `sourceKey` `appointment:<id>:service` or `:cancellation`; money from `lineMoney()` in `src/lib/live/finance.ts` | Billed amount per visit, revenue share base    |
| Finance corrects minutes | `lineAction` `"edit"` / `"confirm"` updates `billableMinutes` **in place** on the same billable                                                       | Hourly and revenue-share fees follow it        |
| Credits and refunds      | `finance-money.ts` credits an invoice and makes a **new** `…:rebill:<ref>` copy; the original line is untouched                                       | Pay reads the original line, so it never moves |
| Timesheets               | `timesheets` collection, weekly, `approvedTotals` frozen on approval                                                                                  | Hourly method (see decision D1)                |
| Effective dating         | `priceItems.effectiveFrom/To`, `chargeRules`                                                                                                          | Same idea for pay rates                        |
| Roles                    | `src/lib/permissions/catalogue.ts`, `hr.manage`, `finance.work`, `finance.approve`; Super Admin holds everything                                      | Two new permissions                            |
| Audit                    | `audit()` in `src/server/live.ts`, `AuditDoc.therapistId`                                                                                             | Every rate change, with old and new value      |
| Live refresh             | `cached()` is cleared by the change stream; screens reload on `care` events                                                                           | Earnings stay up to date                       |
| Therapist area           | `/therapist/progress` → `TherapistReportsHub` (also embedded for admins in `/care/reports`)                                                           | New "Earnings" tab, therapist-only             |
| Therapist app            | `src/features/live/therapist-app.tsx` (tabs Today, Schedule, Patients, Clinical, Messages, Me)                                                        | Earnings screen from the Me tab                |
| Billing reports          | `Reports` in `src/features/live/finance-hub.tsx`                                                                                                      | New "Therapist earnings" report                |

## 2. Core design decisions

1. **Earnings are calculated, not stored.** One pure function works out every visit's fee from the
   visit, its original billing line and the pay rate in force that day. No `earnings` collection,
   no backfill job, nothing to drift out of sync. The therapist screen, the Finance report and the
   CSV all call the same server function, which is what makes "figures agree everywhere" hold by
   construction.
2. **Pay rates are append-only.** A change is a new row with an effective date. Existing rows are
   never edited or deleted, so the history list and every past figure are reproducible.
3. **Money in integer cents.** Inputs (rate, minutes, billed amount) stay unrounded; each visit fee
   is rounded once to the cent with `Math.round`, half away from zero; totals are sums of those
   cents. Totals therefore always equal the sum of the rows shown (see decision D2).
4. **The therapist DTO is built from a whitelist**, never by deleting fields from the Finance DTO,
   so a new Finance field can never leak to a therapist.

## 3. Data model

New collection `payRates` (types in `src/server/models.ts`, schema in `src/lib/live/pay.ts`):

```ts
interface PayRateDoc {
  _id: ObjectId;
  therapistId: ObjectId;
  method: "per-appointment" | "hourly" | "revenue-share";
  inPersonCents: number | null; // per-appointment only
  telehealthCents: number | null; // per-appointment only
  hourlyCents: number | null; // hourly only
  sharePercent: number | null; // revenue-share only, 0–100, up to 2 dp
  cancellation: "none" | "half" | "full"; // late cancellation and Did not attend
  effectiveFrom: string; // "YYYY-MM-DD", Brisbane day
  note: string; // optional reason for the change
  createdBy: ObjectId;
  createdByName: string;
  createdAt: Date;
  withdrawnAt?: Date | null; // only a rate that has not started yet can be withdrawn
  demo?: boolean; // rows from the seed script
}
```

- Indexes: `{ therapistId: 1, effectiveFrom: -1, createdAt: -1 }` and a unique
  `{ therapistId: 1, effectiveFrom: 1, createdAt: 1 }`.
- Zod validation: exactly the fields for the chosen method are set, others null; amounts are whole
  cents, `> 0`, below sensible caps (fee ≤ $1,000, hourly ≤ $500, share ≤ 100%).
- **Rate in force for a visit** = the newest not-withdrawn row with `effectiveFrom ≤ visit day`
  (Brisbane, via the existing `dayOf()`); a tie on the same date goes to the later `createdAt`.

`AuditDoc` gains an optional `detail: { before: unknown; after: unknown }` so the old and new value
are stored as data, not only in the sentence.

## 4. Fee rules (pure, in `src/lib/live/pay.ts`)

`visitFee(visit, line, rate) → { status, cents | null, reason, notes[] }`

Paid minutes = the original line's `billableMinutes` when it exists (Finance corrections), else
`checkOut.minutes`, else scheduled minutes.

| Visit                                                                                         | Per appointment                                      | Hourly                                 | Revenue share                                                                    |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| Completed, note signed                                                                        | Fee for in person or telehealth. **Ignores minutes** | rate × paid minutes ÷ 60               | share × billed amount of the original service line                               |
| Late cancellation (`late-cancelled`, `cancellation.chargeable`) or Did not attend (`no-show`) | factor × in-person/telehealth fee                    | factor × rate × scheduled minutes ÷ 60 | factor × share × billed amount of the cancellation line (0 if Billing waived it) |

Factor: none 0, half 0.5, full 1.

Status:

- **Earned**: completed with a signed note (`Final` or `Amended`); or a late cancellation / Did not
  attend whose factor is above 0.
- **Pending**: completed but the note is missing, Draft or Pending Signature. Reason: "Sign the
  note to confirm this fee". The amount is still shown. Hourly visits also wait for the week's
  timesheet to be approved, and revenue-share visits wait for a billing line ("Waiting for
  billing to confirm the amount"); until then the fee is an estimate from the discipline's
  default hourly price, labelled "Estimate".
- **Not payable**: cancelled with notice, cancelled by Medisense, rescheduled, aborted, or a
  cancellation with factor 0. Short reason on each.
- **Pay rate not set**: no rate in force on that day. The amount is `null`, never `$0`; headline
  figures say "Pay rate not set" if any visit in the period has no rate.
- A visit whose invoice was credited or refunded keeps its fee and gets the note "Invoice credited:
  your fee is unchanged". Detected by a `:rebill:` copy or a credit naming the line.

Billed amount = `lineMoney(quantity, override?.rate ?? rate, tax).subtotal` of the **original**
line (ex GST, travel lines excluded; see decision D4). Margin compares billed with the pay for
those same billed visits; visits with no billing line yet are counted apart ("n not billed
yet"), so unbilled work never shows as a loss. In the shared database most demo visits from
before Module 07 were never sent to billing, which is why many rows show "not billed yet".

Worked example (done-when list): $90 per appointment, Did not attend = half, 3 signed visits and 1
Did not attend this month → 3 × 9000 + 4500 = 31,500 cents = **$315.00**. Adding a $100 rate from
today leaves those visits on the $90 row because their day is before the new `effectiveFrom`.

Periods (Brisbane): week Monday to Sunday (same as timesheets), calendar month, financial year
1 July to 30 June. Earned figures count Earned visits by visit date; Pending is its own figure.

## 5. Server

New `src/server/pay.ts`:

- `payRatesBoard(me)`: every active therapist, current rate, upcoming rate, history newest first,
  and an alert list (no rate set; visits in the last 90 days with no rate in force). Requires
  `pay.view` or `pay.manage`.
- `setPayRate(me, input)`: requires `pay.manage`. Rules:
  - `effectiveFrom` is today or later (Brisbane). Exception: a therapist's very first rate may be
    backdated, so their existing visits can be paid (decision D3).
  - Optimistic concurrency: the client sends `basedOn` (id of the newest row it saw). If another
    person saved in the meantime the server answers 409 "Someone changed this rate. Reload and
    check it." Two people can never overwrite each other silently.
  - Inserts one row, writes the audit entry (who, when, before, after, effective date), publishes
    a `care` event to the therapist and HR/finance users.
- `withdrawPayRate(me, id)`: `pay.manage`, only while `effectiveFrom` is after today; audited.
- `earningsFor(scope: { therapistIds, from, to, service? })`: loads visits, their original
  billables and the rates in **three queries**, runs `visitFee` on each, returns rows with the
  billed amount. The single source for everything below.
- `myEarnings(user)`: therapist only, their own `therapistId`, maps rows through a whitelist:
  date, patient display name, service, modality, minutes, fee, status, reason, notes. Headline
  figures and a 12-week series. No billed, payer, funding path, item code, invoice, claim or rate
  source fields exist on the type.
- `therapistEarningsReport(me, filters)`: requires `finance.work` (Finance and Finance Manager;
  Super Admin). One row per therapist: visits, billed, pay, margin $ and %. Drill-down returns the
  same rows the therapist sees plus `billedCents`.
- `earningsCsv(me, filters)`: same function, CSV with one line per visit plus a total line,
  amounts to 2 dp, dates `YYYY-MM-DD`, UTF-8 with BOM for Excel, written to the audit trail.

API routes (all through `handle()`, Zod-validated, `cached()` where read-only):

| Route                                   | Who                                                    |
| --------------------------------------- | ------------------------------------------------------ |
| `GET/POST /api/care/hr/pay`             | view: `pay.view`/`pay.manage`; change: `pay.manage`    |
| `GET /api/me/earnings`                  | therapist (own data only, ignores any id in the query) |
| `GET /api/care/billing/earnings`        | `finance.work`                                         |
| `GET /api/care/billing/earnings/export` | `finance.work`                                         |

## 6. Permissions

In `src/lib/permissions/catalogue.ts` (group People and HR), both added to `enforcedPermissions`:

- `pay.view` "See pay rates": defaults Operations Manager, Clinical Lead (the roles with HR access),
  Finance, Finance Manager.
- `pay.manage` "Set pay rates": default Finance Manager only. Super Admin holds every permission.

`roles-seed.ts` already adds new permissions to built-in roles once (`knownPermissions`), so live
roles pick these up without a reset. Golden and route-permission tests are updated to match.

## 7. Screens

**A. People and HR → Pay rates** (`/care/hr/pay`, `src/features/live/pay-rates.tsx`)

- Sidebar entry under People and HR next to Credentials, Leave and absence, Timesheets; page guide
  and breadcrumb meta in `navigation.ts` and `page-guides.ts`. Page opens with `pay.view` or
  `pay.manage`, so a Finance Manager (who has no `hr.manage`) can reach it.
- Alert strip (Rule mark): "n therapists have no pay rate".
- Table: therapist, discipline, method (outline tag), current rate, cancellations, effective from,
  upcoming change. Filters: method, discipline, "no rate".
- Sheet to set a rate: method as choice pills, amount fields for that method only, cancellation
  choice pills (Nothing / Half / Full fee), effective date (today or later), optional note, live
  preview ("A 60-minute in-person visit pays $90.00"). Primary "Save rate" only for `pay.manage`;
  others see read-only with the reason. Destructive "Withdraw" needs confirmation.
- History list per therapist, newest first, with who and when.

**B. My earnings** (therapist)

- Web: new "Earnings" tab in `TherapistReportsHub`, shown only when the viewer is that therapist
  (hidden in the admin-embedded view in `/care/reports`).
- Four figures: This week, This month, This financial year, Pending.
- 12-week chart (`TrendChart`, Earned only), visit list newest first (date, patient, service,
  in person/telehealth, minutes, fee, status tag + reason), filters date range and service.
- App: an "Earnings" row on the Me tab opening the same content, built for 390 px, from the same
  `/api/me/earnings`.

**C. Billing → Reports → Therapist earnings** (`finance-hub.tsx` Reports tab)

- Table per therapist: visits, billed, pay, margin $, margin %. Filters date range, service,
  therapist (shares the existing finance filter bar where it fits). Totals row.
- Row click opens a sheet with that therapist's visit list plus a Billed column.
- "Export CSV" button.

All three: skeleton, empty state, error with Retry, amounts right-aligned, AUD to the cent, tokens
only, no new colours.

## 8. Demo data script

`scripts/seed-pay-rates.mjs` (`pnpm demo:pay-rates`, same `.env.local` loading as
`reset-demo-passwords.mjs`):

- Touches only `payRates`. Never drops, resets or restores anything. Inserts a rate only for an
  active therapist that has **no** pay rate yet, so running it twice changes nothing.
- `--dry-run` prints what it would insert.
- Deterministic mix by therapist order: about half per appointment ($85–$95 in person, $70–$80
  telehealth), a quarter hourly ($50–$60), a quarter revenue share (55–65%); cancellation setting
  varies.
- First rates start 1 July 2026 (start of the financial year). Two therapists get a second rate
  from 1 October 2026 so the history and a rate change are visible.
- All rows `demo: true`, removable in one query.

## 9. Tests (vitest)

`src/lib/live/pay.test.ts` (pure):

- Each method: per appointment in person and telehealth; hourly with odd minutes; revenue share.
- The worked example gives exactly 31,500 cents, and still does after adding a $100 rate today.
- Mid-month change: visits each side of the date use their own rate; the month total combines both.
- Cancellations: none, half, full, for each method; cancelled with notice is Not payable.
- Corrected minutes: hourly and revenue share follow, per appointment does not.
- Credit or refund leaves the fee unchanged and adds the note.
- No rate: `null` amount and "Pay rate not set", never 0.
- Rounding: totals equal the sum of rows for awkward values (e.g. $55 × 47 min, 60% × $193.99).
- Period edges: Brisbane midnight, Monday week start, 30 June / 1 July.

`src/server/pay.test.ts` and route tests:

- `setPayRate` refuses without `pay.manage`, refuses a past date (except first rate), returns 409
  on a stale `basedOn`, and writes an audit entry with before and after.
- `/api/me/earnings` as a therapist: the serialised JSON contains none of `billed`, `payer`,
  `invoice`, `claim`, `rate`, `itemCode`, `path`, `funding` (recursive key check), and only their
  own visits.
- `/api/care/billing/earnings` and export are 403 for therapists and for roles without
  `finance.work`.
- One fixture through all three outputs (therapist DTO, Finance report, CSV) gives identical pay
  per therapist.

Then `pnpm check && pnpm build`, and a browser pass on the three screens and the app.

## 10. Order of work

1. Types, Zod schemas and the pure `visitFee` and period functions, with their tests.
2. `payRates` collection, indexes, `src/server/pay.ts`, permissions, API routes, server tests.
3. Pay rates tab (Part A) and the seed script; run the script with `--dry-run`, then for real.
4. My earnings on the web, then in the app (Part B).
5. Therapist earnings report, drill-down and CSV (Part C).
6. Cross-screen consistency test, `pnpm check && pnpm build`, browser check, PR.

## 11. Open decisions (recommended answer first)

- **D1. Hourly pay basis.** The task says "rate × hours from the approved timesheet", but also that
  a Finance minutes correction should change an hourly fee, which only works per visit.
  Recommended: fee per visit = rate × paid minutes; it shows as Pending ("Waiting for your
  timesheet to be approved") until that week's timesheet is approved. Non-visit time (notes,
  meetings, travel) is not paid in this task. Alternative: pay the approved weekly worked hours
  as one weekly line, and corrections to visit minutes don't change it.
- **D2. Rounding.** "Totals from unrounded values, rounded once" and "always match the sum shown"
  can disagree by a cent. Recommended: each visit fee is rounded once from unrounded inputs, and
  totals add those cents, so every total equals its rows on every screen and in the CSV.
- **D3. Backdating.** Recommended: new rates start today or later; only a therapist's first rate
  may be backdated. Otherwise a backdated edit would change earnings already shown.
- **D4. "Billed" for margin.** Recommended: what was charged for the visit's service or
  cancellation line, ex GST, before credits, travel lines excluded. Credits and refunds stay in the
  existing Credits and adjustments report.

Out of scope, as the task says: paying therapists, payroll connections, tax, super, payslips and
the monthly statement.
