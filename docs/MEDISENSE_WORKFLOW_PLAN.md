# Medisense workflow plan: website research, demo comparison and build plan

Written 10 November 2026. Phase A only: research and planning. This file is the only change Phase A makes; no code, data or config was touched. Paths are relative to `Medisense-clinical-dashboard/`.

**Labels used throughout**

- **[Site]**: stated on medisense.com.au or its linked referral form. The page is named.
- **[Form]**: the online referral form linked from the site (Jotform 241317443681455).
- **[Practice]**: standard Australian allied health practice added to fill a gap. Not stated by Medisense. Neil should confirm it.
- **[Repo]**: what this codebase does today, with file paths.

---

## 1. Summary

1. Medisense is broader than the demo. The site lists **9 disciplines** (OT, speech pathology, physiotherapy, exercise physiology, psychology, trauma therapy, dietetics, podiatry, nursing) and an early childhood and paediatrics service line. It names **7 ways to pay**: NDIS, workers' compensation, aged care, Medicare, private health insurance, self-payment and life insurance partnerships. The demo models 2 disciplines and 2 funding types (`src/data/types.ts:7,12`).
2. The **referral form is the most useful single source**. It is an NDIS participant form with 50+ fields and conditional logic. It has a hidden staff section that builds the **service agreement** from NDIS price-guide line items, travel lines and a pricing zone. The demo's intake doesn't capture the plan type, plan manager, signatory, booking contact, service location, behaviours of concern, therapist risk or the supports requested with their frequency.
3. The audit's hero flow (note → prepared report, form and tasks → admin queue → reminder → supervision brief → Overview changes) **has since been built** as the connected story (`src/state/story*.ts`, `/sessions/oliver-grant`, `/admin-queue`, `/since-yesterday`, `/before-after`). The remaining gap is that it runs on generic workflows, not Medisense's real ones.
4. Biggest missing pieces, in demo impact order: intake matching the real form; the service agreement and signature; the 48-hour cancellation rule; therapist matching; a multidisciplinary care plan fed by the assessment report; claims routed by plan type; the workers' compensation journey (insurer, employer, approvals, return-to-work report); the aged care AT and home modification journey; discharge.
5. The plan has 15 items in 3 releases. **Release 1** (about 5–6 weeks for one developer) makes the NDIS journey real from first contact to claim. **Release 2** (about 4–5 weeks) adds the care plan, workers' compensation and aged care. **Release 3** (about 2–3 weeks) adds discharge, telehealth, the other payers and polish.
6. Item 0, splitting the 1,644-line store into slices and adding tests, goes first. Every later item touches it.
7. **Blocking decisions before Phase B:** the product name (CareFlow or Medisense), and whether the website replaces the KPI figures agreed with the client (12 clinicians, OT and speech only, 184 = 128 NDIS + 56 aged care). See section 8.

---

## 2. Research notes

All pages were fetched on 10 November 2026 and all loaded. The referral form was also downloaded and parsed field by field, including its conditional-logic rules, so the field list below is exact rather than summarised.

### 2.1 What the website says

| Fact                                                                                                                                                                                                                                    | Source page                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Disciplines: physiotherapy, occupational therapy, speech pathology, exercise physiology, psychology, trauma therapy, dietitian, podiatry, nursing                                                                                       | Home, `/therapies/`, `/about/`, `/brisbane/`                           |
| Early childhood and paediatrics is a service line covering infants, toddlers and preschool. It uses physio, EP, OT and speech, with psychology and trauma therapy for behaviour and emotions. No paediatrician is named on its own page | `/early-childhood-and-paediatrics/`                                    |
| Services: early childhood and paediatrics, telehealth, assessments and therapies, NDIS services, workers' compensation, aged care                                                                                                       | `/services/`                                                           |
| Assessments are cognitive, physical and developmental, with "in-depth reports to guide treatment". Delivered in-home or by telehealth                                                                                                   | `/services/`                                                           |
| "Registered NDIS provider"                                                                                                                                                                                                              | `/services/` (NDIS section), `/brisbane/`                              |
| Workers' compensation: tailored rehabilitation plans, return-to-work programs, "works closely with employers and insurance providers"                                                                                                   | `/services/`                                                           |
| Aged care: personalised support plans, health monitoring through regular assessments, home and community-based services, families involved                                                                                              | `/services/`                                                           |
| Telehealth: remote consultations, "secure, easy-to-use online appointment platform", flexible scheduling, "for certain treatments"                                                                                                      | `/services/`, `/contact/`                                              |
| Payment: "Private health insurance, Medicare, and self-payment are accepted"                                                                                                                                                            | `/contact/`                                                            |
| Life insurance partnerships, to deliver therapy with insurance providers                                                                                                                                                                | `/brisbane/`                                                           |
| Psychology can be funded by Medicare under Chronic Disease Management and needs a GP or specialist referral                                                                                                                             | `/psychology/`                                                         |
| Podiatry is described as NDIS-funded, under "Improved Daily Living" or "Improved Health & Wellbeing". The FAQ says no referral is needed if podiatry is in the plan, but the page also shows "Submit Referral"                          | `/podiatry/`                                                           |
| Nursing is for NDIS participants and others: medication management, wound care, continence and catheter care. Families are encouraged to be involved                                                                                    | `/nursing/`, `/therapies/`                                             |
| OT process: referral, then an initial assessment that includes the home environment, then a tailored plan (modifications, assistive devices, exercises), then sessions on a schedule set from the assessment and goals                  | `/occupational-therapy/`                                               |
| EP process: referral, physical assessment, customised program, ongoing monitoring and adjustment                                                                                                                                        | `/exercise-physiology/`                                                |
| Multidisciplinary: OT works with physio, speech and psychology. Physio is often combined with OT or EP. Psychology can be paired with physio or OT                                                                                      | `/occupational-therapy/`, `/physiotherapy/`, `/psychology/`            |
| Client groups: children, adults, seniors, NDIS participants, people with chronic conditions, people recovering from workplace injuries, post-operative patients                                                                         | `/occupational-therapy/`, `/physiotherapy/`, `/nursing/`, `/services/` |
| Service model: home visits are primary; "We don't have a physical clinic." The Brisbane page says "anywhere in Brisbane"                                                                                                                | Home, `/contact/`, `/brisbane/`                                        |
| Locations: Brisbane active; Tasmania and Sydney "coming soon"                                                                                                                                                                           | Every page footer                                                      |
| Hours: Monday to Friday, 9:00 am to 5:00 pm                                                                                                                                                                                             | Home, `/contact/`, every therapy page                                  |
| Cancellation: 48 hours' notice to cancel or reschedule                                                                                                                                                                                  | Home, `/contact/`                                                      |
| "No wait time"; accepting new patients                                                                                                                                                                                                  | Home, every therapy page                                               |
| Contact: referral form, contact form, 1300 092 879, hello@medisense.com.au                                                                                                                                                              | Home, `/contact/`                                                      |
| Contact form fields: first name, last name, phone, email, "Your Role" (Participant, Guardian, Support Coordinator, Others), message                                                                                                     | `/contact/`                                                            |
| Careers: roles open for speech pathologist, OT, dietitian, exercise physiologist, physiotherapy. Work location Brisbane only. Flexible hours                                                                                            | `/join-us/`                                                            |

**Site inconsistencies worth knowing, not copying:** the psychology page has a "Why choose Occupational Therapy" heading. Several Brisbane page cards link to the speech pathology page. A child emotional-support section is headed "Physical Fitness Improvement". The podiatry referral rule contradicts itself. The therapy pages say "home only", while the referral form also offers school, daycare, day program, community and telehealth. **The form is the operational truth.**

### 2.2 The referral form, field by field [Form]

Title: "Participant Referral Form". It is NDIS-only: plan number, plan end date and plan type are all required. `*` = required. "Shows when" is the form's own conditional logic.

| #     | Field                                                                         | Type and options                                                                                                                                                                                                                                                                                                                                                                               | Req.         | Shows when / rule                                                                             |
| ----- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| 1     | Participant Name                                                              | First, last                                                                                                                                                                                                                                                                                                                                                                                    |              |                                                                                               |
| 2     | Current Address                                                               | Street, line 2, city, state, postcode                                                                                                                                                                                                                                                                                                                                                          | *            |                                                                                               |
| 3     | Date of Birth                                                                 | Day / month / year                                                                                                                                                                                                                                                                                                                                                                             | *            |                                                                                               |
| 4     | Participant Email                                                             | Email                                                                                                                                                                                                                                                                                                                                                                                          |              |                                                                                               |
| 5     | Participant Phone Number                                                      | Phone                                                                                                                                                                                                                                                                                                                                                                                          |              |                                                                                               |
| 6     | NDIS Plan Number                                                              | Text                                                                                                                                                                                                                                                                                                                                                                                           | *            |                                                                                               |
| 7     | Plan End Date                                                                 | Text (a date)                                                                                                                                                                                                                                                                                                                                                                                  | *            |                                                                                               |
| 8     | Plan Type                                                                     | Plan Managed · Self-Managed · Agency Managed                                                                                                                                                                                                                                                                                                                                                   | *            |                                                                                               |
| 9     | Is there funding periods in the Participant's Plan                            | Yes · No                                                                                                                                                                                                                                                                                                                                                                                       | *            |                                                                                               |
| 10    | Funding period details                                                        | Long text                                                                                                                                                                                                                                                                                                                                                                                      |              | #9 = Yes                                                                                      |
| 11    | Plan Manager Company                                                          | Text                                                                                                                                                                                                                                                                                                                                                                                           | * when shown | #8 = Plan Managed (shown and required)                                                        |
| 12    | Plan Manager Email                                                            | Email                                                                                                                                                                                                                                                                                                                                                                                          | * when shown | #8 = Plan Managed                                                                             |
| 13    | Support Coordinator Name                                                      | First, last                                                                                                                                                                                                                                                                                                                                                                                    |              |                                                                                               |
| 14    | Support Coordinator Email                                                     | Email                                                                                                                                                                                                                                                                                                                                                                                          |              |                                                                                               |
| 15    | Support Coordinator Phone Number                                              | Phone                                                                                                                                                                                                                                                                                                                                                                                          |              |                                                                                               |
| 16    | Service Agreement Signatory                                                   | Participant · Guardian/Nominee · CSO/OPG · Support Coordinator. Help text: "This will be who the Service Agreement will be sent to."                                                                                                                                                                                                                                                           |              |                                                                                               |
| 17    | Role                                                                          | Text                                                                                                                                                                                                                                                                                                                                                                                           |              | Auto-filled when #16 is Participant, Guardian/Nominee or Support Coordinator                  |
| 18–20 | Signatory name, email, phone                                                  |                                                                                                                                                                                                                                                                                                                                                                                                |              | Copied from the participant or coordinator when #16 is one of them; hidden when #16 = CSO/OPG |
| 21    | Appointment Booking Contact                                                   | Participant · Guardian/Nominee · Support Coordinator · Other                                                                                                                                                                                                                                                                                                                                   |              |                                                                                               |
| 22    | Preferred Contact Method                                                      | Phone Call · Text Message · Email · Other                                                                                                                                                                                                                                                                                                                                                      |              |                                                                                               |
| 23    | Preferred contact time (if required)                                          | Text                                                                                                                                                                                                                                                                                                                                                                                           |              |                                                                                               |
| 24–26 | Booking contact name, email, phone                                            |                                                                                                                                                                                                                                                                                                                                                                                                |              | Copied when #21 is Participant or Support Coordinator                                         |
| 27    | Preferred Service Location                                                    | Home · School · Telehealth · Daycare · Day Program · Other community location (e.g. library) · Other                                                                                                                                                                                                                                                                                           | *            |                                                                                               |
| 28    | Location Contact Details                                                      | Text                                                                                                                                                                                                                                                                                                                                                                                           |              | #27 = Daycare, Day Program or community location                                              |
| 29    | School Contact Details                                                        | Text                                                                                                                                                                                                                                                                                                                                                                                           |              | #27 = School                                                                                  |
| 30    | Preferred Location Address                                                    | Address + country                                                                                                                                                                                                                                                                                                                                                                              |              | #27 ≠ Home                                                                                    |
| 31    | Accepted/Primary Diagnosis                                                    | Text                                                                                                                                                                                                                                                                                                                                                                                           |              |                                                                                               |
| 32    | Is there Behaviours of Concern present                                        | Yes · No                                                                                                                                                                                                                                                                                                                                                                                       | *            |                                                                                               |
| 33    | Behaviours of concern details                                                 | Long text                                                                                                                                                                                                                                                                                                                                                                                      |              | #32 = Yes                                                                                     |
| 34    | Is there any known risk for the Therapist                                     | Yes · No                                                                                                                                                                                                                                                                                                                                                                                       | *            |                                                                                               |
| 35    | Risk details                                                                  | Long text                                                                                                                                                                                                                                                                                                                                                                                      |              | #34 = Yes                                                                                     |
| 36    | Does Participant require a specific person present                            | Yes · No                                                                                                                                                                                                                                                                                                                                                                                       |              |                                                                                               |
| 37    | Role of person needing to be present                                          | Parent · Support Worker · Other                                                                                                                                                                                                                                                                                                                                                                |              | #36 = Yes                                                                                     |
| 38    | Supports Requested                                                            | Multi-select: Functional Capacity Assessment · SIL/ILO Housing Assessment · SDA Housing Assessment · Home Mod Assessment · Assistive Technology Assessment · Occupational Therapy · Speech Therapy · Swallowing Assessment · Speech/Language Assessment · Exercise Physiology · Physiotherapy · Psychological Assessment · Psychological Therapy · Trauma Therapy · Nursing · Podiatry · Other |              |                                                                                               |
| 39–44 | Frequency per discipline (OT, physio, EP, psychology, trauma therapy, speech) | Assessment · Weekly · Fortnightly · Monthly · Other                                                                                                                                                                                                                                                                                                                                            |              | Each shows when its discipline is ticked in #38                                               |
| 45    | Nursing                                                                       | Continence Assessment · AT Assessment · Wound/Catheter Supports · Other                                                                                                                                                                                                                                                                                                                        |              | #38 includes Nursing                                                                          |
| 46    | NDIS Goals (if known)                                                         | Long text                                                                                                                                                                                                                                                                                                                                                                                      |              |                                                                                               |
| 47    | Additional comments / Servicing requirements                                  | Long text                                                                                                                                                                                                                                                                                                                                                                                      |              |                                                                                               |
| 48    | File Upload                                                                   | Files                                                                                                                                                                                                                                                                                                                                                                                          |              |                                                                                               |
| —     | **Staff section**, unlocked by a hidden "edit" widget                         |                                                                                                                                                                                                                                                                                                                                                                                                |              | Not shown to referrers                                                                        |
| 49    | Date of Agreement                                                             | Date                                                                                                                                                                                                                                                                                                                                                                                           | *            | Staff                                                                                         |
| 50    | Select State                                                                  | QLD · Remote · Very Remote (NDIS pricing zones)                                                                                                                                                                                                                                                                                                                                                | *            | Staff                                                                                         |
| 51    | Services List                                                                 | Multi-select of about 75 NDIS support lines in four groups: therapy supports, core supports (registered nurse by time band, "EC" early childhood lines), employment supports (including rehabilitation counsellor) and wellbeing lines. Each has a matching "Travel" line, plus Non-labour Costs                                                                                               | *            | Staff                                                                                         |
| 52    | Quantity per selected line                                                    | Number                                                                                                                                                                                                                                                                                                                                                                                         |              | Each pair (line + travel) shows when its line is ticked                                       |

**What this tells us about Medisense's real workflow:**

- Intake is **NDIS-first**. Plan type decides who gets invoiced, and the plan manager becomes required when the plan is plan managed.
- The **service agreement is built from the referral**. The signatory is chosen at referral, and admin adds the date, pricing zone and support lines with hours and travel.
- **Safety screening happens at intake.** Behaviours of concern, therapist risk and "specific person present" all affect who can be matched and how the visit is staffed.
- Services happen at **home, school, daycare, day programs, community locations and by telehealth**, each with its own contact details.
- **Frequency is requested per discipline**: Assessment, Weekly, Fortnightly or Monthly. This seeds the session schedule.

### 2.3 Standard practice added to fill gaps [Practice]

These fill gaps the site doesn't cover. Exact rules, item numbers and rates must be confirmed against current NDIS, WorkCover Queensland and aged care documents before anything is presented as fact. The demo will label rates as "sample".

- **NDIS:** a written service agreement is expected practice. Claiming depends on plan type: agency managed goes through the NDIA provider portal, plan managed is an invoice to the plan manager, self managed is an invoice to the participant. Support lines and price limits come from the NDIS pricing arrangements. Provider travel and short-notice cancellations can be claimed under defined conditions, which must be checked against the current version. Progress reports are typically due before a plan reassessment, usually requested by the support coordinator. A functional capacity assessment often supports plan reviews and housing applications (SIL/SDA).
- **Workers' compensation (Queensland):** most employers are insured by WorkCover Queensland, and some are self-insurers. Allied health treatment usually needs insurer approval for a number of sessions. A doctor issues work capacity certificates. The employer usually has a return-to-work coordinator and the insurer a case manager. Progress and return-to-work reports go to the insurer. The employer receives duties and capacity information only, within the worker's consent.
- **Aged care:** Support at Home has replaced Home Care Packages. Older people are assessed through My Aged Care and get a classification. A registered provider acts as "care partner". Assistive technology and home modifications are funded through the AT-HM scheme, often needing an allied health prescription or recommendation. Commonwealth Home Support Programme clients move to Support at Home later. Families are commonly decision-makers or contacts.
- **Medicare:** under a GP Chronic Disease Management plan, a limited number of allied health sessions per calendar year attract a rebate, and a report goes back to the GP.
- **General:** consent to treatment and consent to share information, a working-days rule for note completion, discharge summaries to the referrer, and keeping records after discharge.

---

## 3. Patient journeys

Actors: **Client** (participant or worker), **Guardian/Family**, **SC** (support coordinator), **PM** (plan manager), **Insurer** (case manager), **Employer** (return-to-work coordinator), **GP**, **Admin**, **Therapist**, **Supervisor**, **Rules** (automation), **AI**.

⚠ marks where work is usually re-typed or slow. These are where the product adds value.

### 3.1 NDIS participant: Leila, 6, developmental delay, OT and speech

| #   | Step                                                                                                                                                                                                                   | Who                                        | Label                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| 1   | SC emails a referral with a plan excerpt, or fills in the online form. Contact form role = Support Coordinator                                                                                                         | SC                                         | [Site][Form]                                                         |
| 2   | Admin reads the referral and re-types it into the practice system: plan number, plan type, plan end, plan manager, signatory, booking contact, location, risks, supports and frequency ⚠                               | Admin (AI can extract)                     | [Form]                                                               |
| 3   | Funding check: confirm plan dates and that plan type and plan manager are present. Check the plan has capacity-building therapy funds ⚠                                                                                | Admin                                      | [Practice]                                                           |
| 4   | Service agreement: admin selects the pricing zone, support lines, hours and travel, then sends it to the signatory chosen on the form. Consent to treatment and to share information go with it ⚠ (chasing signatures) | Admin → Guardian/SC                        | [Form] signatory and lines; [Practice] consent                       |
| 5   | Match an OT and a speech pathologist by discipline, region, availability, caseload, risk flags and a required person present ⚠                                                                                         | Admin (Rules rank)                         | [Form] risk fields; [Practice] matching                              |
| 6   | Book the first home visit with the booking contact by their preferred method, Monday to Friday, 9 to 5                                                                                                                 | Admin → Guardian                           | [Site] hours; [Form] booking contact                                 |
| 7   | Initial assessment at home (OT environment and developmental, speech/language)                                                                                                                                         | Therapists                                 | [Site]                                                               |
| 8   | Assessment report written; a tailored plan agreed with the family. One shared care plan across OT and speech ⚠ (two disciplines, two documents)                                                                        | Therapists (AI drafts), Guardian           | [Site] "in-depth reports", multidisciplinary; [Practice] shared plan |
| 9   | Session schedule set from the requested frequency and goals (for example OT weekly, speech fortnightly)                                                                                                                | Admin / Rules                              | [Form] frequency; [Site]                                             |
| 10  | Sessions at home, school or daycare; note written after each ⚠                                                                                                                                                         | Therapist (AI drafts note)                 | [Site][Form]                                                         |
| 11  | Cancellation: 48 hours or more = normal cancellation; less = short notice, possibly claimable under the agreement; no-show handled the same way ⚠                                                                      | Guardian → Admin, Rules                    | [Site] 48 h; [Practice] claim                                        |
| 12  | Claim after an approved note: agency → portal claim, plan managed → invoice to PM, self managed → invoice to family ⚠                                                                                                  | Rules, Admin approves                      | [Form] plan type; [Practice]                                         |
| 13  | Follow-ups and reminders: notes due, home practice, school contact, unsigned agreement                                                                                                                                 | Rules                                      | [Practice]                                                           |
| 14  | Progress report before the plan end date, to the SC and family, sometimes for the NDIA ⚠                                                                                                                               | Therapists (AI drafts), Supervisor reviews | [Form] plan end; [Practice]                                          |
| 15  | Plan reassessment: the new plan updates the agreement and care plan                                                                                                                                                    | Admin, SC                                  | [Practice]                                                           |
| 16  | Discharge (goals met, plan ended, moved away): discharge summary to SC and family, agreement ended, final claim                                                                                                        | Therapist, Admin                           | [Practice]                                                           |

### 3.2 Workers' compensation: Daniel, 41, lower back injury at work, physio and EP

| #   | Step                                                                                                                                              | Who                               | Label                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Insurer case manager or GP refers, or the worker calls. The referral carries the claim number, injury date and employer                           | Insurer / GP / Client             | [Site] "works closely with employers and insurance providers"; [Practice] referral content |
| 2   | Intake: record claim number, insurer, case manager, employer, return-to-work coordinator, injury date and the current work capacity certificate ⚠ | Admin (AI can extract)            | [Practice]                                                                                 |
| 3   | Funding check: insurer approval for an initial assessment and a number of sessions per discipline ⚠                                               | Admin → Insurer                   | [Practice]                                                                                 |
| 4   | Consent: treatment consent and consent to share information with the insurer and employer, with the employer limited to capacity and duties       | Client                            | [Practice]                                                                                 |
| 5   | Match a physio and an EP near home or workplace                                                                                                   | Admin (Rules rank)                | [Site] physio and EP combined                                                              |
| 6   | Initial assessment at home: function, pain, work demands                                                                                          | Physio                            | [Site]                                                                                     |
| 7   | Rehabilitation and return-to-work plan with goals tied to work duties; one plan across physio and EP ⚠                                            | Therapists (AI drafts), Client    | [Site] "tailored rehabilitation plans, return-to-work programs"                            |
| 8   | Schedule within the approved sessions                                                                                                             | Admin / Rules                     | [Practice]                                                                                 |
| 9   | Sessions and notes; EP program at home or workplace                                                                                               | Therapists                        | [Site]                                                                                     |
| 10  | Cancellation under the 48-hour rule; insurer rules on non-attendance may also apply                                                               | Rules, Admin                      | [Site] 48 h; [Practice]                                                                    |
| 11  | Invoice the insurer per session, quoting the claim number ⚠                                                                                       | Rules, Admin approves             | [Practice]                                                                                 |
| 12  | Approved sessions running out: request more sessions with a progress summary ⚠                                                                    | Rules flag, Therapist (AI drafts) | [Practice]                                                                                 |
| 13  | Progress and return-to-work report to the insurer; duties and capacity summary to the employer; copy to the GP ⚠ (three versions of one report)   | Therapist (AI drafts), Supervisor | [Practice]                                                                                 |
| 14  | New work capacity certificate: update capacity and duties                                                                                         | Admin                             | [Practice]                                                                                 |
| 15  | Discharge: returned to full duties, or claim closed; final report and invoice                                                                     | Therapist, Admin                  | [Site] "return to work"; [Practice]                                                        |

### 3.3 Aged care: Margaret, 82, falls risk at home, OT home safety and AT, daughter involved

| #   | Step                                                                                                                                | Who                                  | Label                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | The daughter calls (contact form role "Other"), or the Support at Home care partner refers                                          | Family / Care partner                | [Site] families involved; [Practice] care partner                                    |
| 2   | Intake: funding program (Support at Home, CHSP or private), My Aged Care ID, classification, care partner contact, decision-maker ⚠ | Admin                                | [Practice]                                                                           |
| 3   | Funding check with the care partner: budget available, quote approval for AT or home modifications ⚠                                | Admin → Care partner                 | [Practice]                                                                           |
| 4   | Agreement and consent, signed by the client or the decision-maker                                                                   | Client / Family                      | [Practice]                                                                           |
| 5   | Match an OT with home safety experience; physio if falls risk is high                                                               | Admin                                | [Site] OT for seniors; physio falls prevention                                       |
| 6   | Home safety and AT assessment                                                                                                       | OT                                   | [Site] "assistive technology assessments" (Home), "assess the home environment" (OT) |
| 7   | AT prescription and home modification report with recommendations, then quotes ⚠                                                    | OT (AI drafts), Care partner         | [Practice] AT-HM                                                                     |
| 8   | Support plan shared with family: OT, physio, maybe dietitian or nursing                                                             | Therapists, Family                   | [Site] "personalised support plans", families                                        |
| 9   | Sessions: AT trial and training, falls program                                                                                      | OT, Physio                           | [Site]                                                                               |
| 10  | Cancellation under the 48-hour rule                                                                                                 | Rules                                | [Site]                                                                               |
| 11  | Invoice the care partner against the client's budget ⚠                                                                              | Rules, Admin approves                | [Practice]                                                                           |
| 12  | Family updates after each visit (if consented) ⚠                                                                                    | Rules (template), Therapist approves | [Site] families; [Practice]                                                          |
| 13  | Regular reassessment of physical, cognitive and emotional wellbeing                                                                 | Rules schedule, Therapist            | [Site] "health monitoring through regular assessments"                               |
| 14  | Discharge or ongoing review; summary to care partner, GP and family                                                                 | Therapist                            | [Practice]                                                                           |

---

## 4. Comparison with the demo today

Statuses follow the audit: **Built** = works end to end; **Partial** = UI only, scripted, hard-coded or incomplete; **Missing** = absent. The audit (6 Nov) is out of date in places: referral extraction is now live AI (`src/lib/ai/story.ts:46–89`, `src/app/api/story/route.ts:58`), the hero flow is connected, and the store is 1,644 lines, not 927. Evidence below comes from reading the current code. Nothing was run in this phase.

Feature numbers (F0–F14) refer to section 6.

### 4.1 NDIS journey

| Step                          | Who                       | What the demo has (route / file)                                                                                                                                                                                                                         | Status                 | Gap                                                                                                                                                                | Proposed solution              |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| First contact                 | SC / Guardian             | `/intake`. Sources Email, Web form, GP letter, Phone intake, School letter (`src/data/referrals.ts:16`)                                                                                                                                                  | Partial                | No contact-form enquiry and no enquirer role (Participant / Guardian / SC / Other); the referrer isn't a record                                                    | F2, F3                         |
| Intake & funding check        | Admin, AI                 | AI extracts free-label fields from pasted text (`src/features/intake/new-referral.tsx`, `src/lib/ai/story.ts`); funding enum is NDIS / Aged care / Unknown (`src/lib/ai/story.ts:53,64`)                                                                 | Partial                | None of the form's structured fields (plan number, type, end, PM, signatory, booking contact, location, risks, supports, frequency); no conditional required rules | F1, F2                         |
| Service agreement & consent   | Admin → Signatory         | Template names only: "NDIS service agreement", "Consent to share information" (`src/data/forms.ts:286–293`)                                                                                                                                              | Missing                | No agreement record, lines, pricing zone, signatory, sending or signed state                                                                                       | F4                             |
| Matching & booking            | Admin, Rules              | `BookVisitSheet`: manual clinician pick, clash rule, next free slot (`src/features/schedule/book-visit.tsx:26–82`); "Book first home visit" task on verify (`src/state/demo-store.ts:787–802`); static `suggestedClinician` (`src/data/referrals.ts:44`) | Partial                | No ranking by discipline, region, availability, risk or required person; office hours not enforced                                                                 | F5, F6                         |
| Initial assessment            | Therapist                 | Visit types Home visit, Telehealth, Supervision, Team meeting (`src/data/schedule.ts:8`)                                                                                                                                                                 | Partial                | No assessment visit type and no location other than home or telehealth                                                                                             | F1, F7                         |
| Assessment report & care plan | Therapist, AI             | Report types include FCA, AT, home modification, speech/language (`src/data/reports-library.ts:4–11`); "Generate AI draft" only flips status (`src/state/demo-store.ts:927–941`); goals read-only in profiles (`src/data/client-profiles.ts:6–19`)       | Partial / Missing      | No assessment-to-report AI flow; no care plan entity shared across disciplines                                                                                     | F7                             |
| Session schedule              | Admin, Rules              | Week generated per clinician (`src/data/schedule.ts` `clinicianWeek`)                                                                                                                                                                                    | Partial                | No recurrence from requested frequency                                                                                                                             | F5                             |
| Sessions & notes              | Therapist, AI             | `/sessions/oliver-grant` with dictation and live AI note (`src/features/session/session-note.tsx`); `/case-notes/[caseId]`                                                                                                                               | Partial (strongest)    | Scripted to one client; no discipline-specific templates beyond OT and speech                                                                                      | F1 (templates), later releases |
| Cancellation (48 h)           | Guardian, Rules           | `cancelVisit` sets cancelled and frees the slot (`src/state/demo-store.ts:752–765`)                                                                                                                                                                      | Missing                | No notice calculation, short-notice or no-show state, or claimable cancellation                                                                                    | F6                             |
| Billing / claims              | Rules, Admin              | `/billing`: lines from completed visits, held until note approved (`src/features/billing/billing.tsx:64–95`); flat hourly sample rate (`src/data/operations.ts:157`); unknown funding guessed by name seed (`billing.tsx:84–86`)                         | Partial                | No routing by plan type (portal / PM / participant), support lines, travel or cancellation lines                                                                   | F8                             |
| Follow-ups & reminders        | Rules                     | Tasks, automations, Advance 1 day with reminder and escalation (`src/state/story.ts`, `/since-yesterday`)                                                                                                                                                | Partial (strong)       | No reminders for unsigned agreements, plan end or reports due                                                                                                      | F4, F11                        |
| Progress report               | Therapist, AI, Supervisor | Report prepared from the approved note (`src/features/session/prepared-view.tsx`); Emily Carter report (`/progress-reports/emily-carter`)                                                                                                                | Partial                | Not triggered by plan end; no recipient (SC, family, PM)                                                                                                           | F11                            |
| Review / reassessment         | Admin, SC                 | `plan.review` and `daysToReview` shown (`src/data/client-profiles.ts:43`); `planReviewDays` (`src/data/client-directory.ts:19`)                                                                                                                          | Partial (display only) | No workflow when a new plan arrives                                                                                                                                | F11, F12                       |
| Discharge                     | Therapist, Admin          | "Discharge summary" report type (`src/data/reports-library.ts:11`); client state is Active / Paused / New (`src/data/client-directory.ts:17`)                                                                                                            | Missing                | No discharged state, summary flow, notification or agreement end                                                                                                   | F12                            |

### 4.2 Workers' compensation journey

| Step                     | Who                   | What the demo has                                                           | Status  | Gap                                                             | Proposed solution |
| ------------------------ | --------------------- | --------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- | ----------------- |
| First contact            | Insurer / GP / Client | Referral sources have no insurer (`src/data/referrals.ts:16`)               | Missing | No insurer or GP referral type                                  | F2, F9            |
| Intake & funding check   | Admin                 | Funding type has no workers' comp (`src/data/types.ts:12`)                  | Missing | No claim number, insurer, employer, injury date or certificate  | F1, F9            |
| Consent                  | Client                | "Consent to share information" template name (`src/data/forms.ts:290`)      | Missing | No consent scoped by recipient (insurer full, employer limited) | F4, F9            |
| Matching & booking       | Admin                 | Disciplines are OT and speech only (`src/data/types.ts:7`)                  | Missing | No physio or EP clinicians to match                             | F1, F5            |
| Initial assessment       | Physio                | —                                                                           | Missing | No physio clinicians or assessment type                         | F1, F7            |
| Rehab & RTW plan         | Therapists, AI        | —                                                                           | Missing | No care plan; no work-duty goals                                | F7, F9            |
| Schedule within approval | Admin, Rules          | —                                                                           | Missing | No approved-sessions count                                      | F9                |
| Sessions & notes         | Therapists            | Generic note flow                                                           | Partial | No physio or EP note context; no workplace location             | F1, F9            |
| Cancellation             | Rules                 | As NDIS                                                                     | Missing | As NDIS                                                         | F6                |
| Invoice insurer          | Rules, Admin          | `/billing` is NDIS / aged care only (`src/features/billing/billing.tsx:33`) | Missing | No insurer invoice with claim number                            | F8, F9            |
| Approval running out     | Rules, AI             | —                                                                           | Missing | No rule and no request draft                                    | F9                |
| Progress & RTW report    | Therapist, AI         | No report type for insurer or employer (`src/data/reports-library.ts:4–11`) | Missing | No dual-recipient report                                        | F9                |
| New certificate          | Admin                 | —                                                                           | Missing | No certificate record                                           | F9                |
| Discharge                | Therapist, Admin      | —                                                                           | Missing | As NDIS                                                         | F12               |

### 4.3 Aged care journey

| Step                              | Who                   | What the demo has                                                                                                                                                                                                                         | Status  | Gap                                                                         | Proposed solution |
| --------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------- | ----------------- |
| First contact                     | Family / Care partner | Aged care referrals exist (`src/data/referrals.ts:137,339`)                                                                                                                                                                               | Partial | Family or care partner isn't a record                                       | F3                |
| Intake & funding check            | Admin                 | Ruth Hallam profile with daughter as decision maker and Support at Home care partner (`src/data/client-profiles.ts:276–278`); home modification form with My Aged Care ID and Support at Home classification (`src/data/forms.ts:54–113`) | Partial | Funding is one "Aged care" label; no program, classification or budget link | F1, F10           |
| Agreement & consent               | Client / Family       | Client consent field on the home modification form (`src/data/forms.ts:113`)                                                                                                                                                              | Partial | No agreement record; no decision-maker signatory                            | F4                |
| Matching                          | Admin                 | Manual pick                                                                                                                                                                                                                               | Partial | As NDIS                                                                     | F5                |
| Home safety & AT assessment       | OT                    | "Assistive technology assessment" and "Home modification report" types (`src/data/reports-library.ts:4–11`)                                                                                                                               | Partial | Report generation is a status flip                                          | F7, F10           |
| AT prescription & home mod report | OT, AI                | Home modification form prefill, hard-coded values (`src/data/forms.ts`)                                                                                                                                                                   | Partial | No AI draft from assessment notes; no quote step                            | F10               |
| Support plan with family          | Therapists, Family    | Family portal for Emily Carter only (`src/features/portal/portal-preview.tsx`, `src/data/portal.ts`)                                                                                                                                      | Partial | No aged-care family view; no shared plan                                    | F7, F10           |
| Sessions                          | OT, Physio            | Generic                                                                                                                                                                                                                                   | Partial | No physio                                                                   | F1                |
| Cancellation                      | Rules                 | As NDIS                                                                                                                                                                                                                                   | Missing | As NDIS                                                                     | F6                |
| Invoice care partner              | Rules, Admin          | `/billing` "Aged care" lines at a flat rate                                                                                                                                                                                               | Partial | No care partner invoice or budget                                           | F8, F10           |
| Family updates                    | Rules                 | Portal messages (`src/state/demo-store.ts` `sendPortalMessage`)                                                                                                                                                                           | Partial | No rule-based update after an approved note                                 | F3, F10           |
| Regular reassessment              | Rules, Therapist      | —                                                                                                                                                                                                                                         | Missing | No reassessment cadence                                                     | F10, F12          |
| Discharge                         | Therapist             | —                                                                                                                                                                                                                                         | Missing | As NDIS                                                                     | F12               |

---

## 5. Narrow-scope locations to update

If the website wins (decision 2 in section 8), every place below changes. Grouped by kind. The dataset figures in `docs/demo-dataset.md` and `CLAUDE.md` are client-agreed, so they change **only after Neil's figures are confirmed**.

**Types and constants (change first; the compiler then finds most of the rest)**

| File:line                                  | Today                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/data/types.ts:7`                      | `Discipline = "Occupational Therapy" \| "Speech Pathology"`                                     |
| `src/data/types.ts:12`                     | `Funding = "NDIS" \| "Aged care"`                                                               |
| `src/data/types.ts:39`                     | `Clinician.funding: { ndis; agedCare }`                                                         |
| `src/data/clinicians.ts:41,96`             | `ndis` input; `agedCare = active − ndis`                                                        |
| `src/data/clinicians.ts:73–74`             | Role derived as OT or speech pathologist only                                                   |
| `src/data/clinicians.ts:387`               | `disciplines = ["Occupational Therapy", "Speech Pathology"]`                                    |
| `src/data/organisation.ts:72,135`          | OT count and `agedCare` in `summarise`                                                          |
| `src/data/forms.ts:23`                     | `funding: "NDIS" \| "Aged care"`                                                                |
| `src/lib/story/types.ts:60`                | `funding: "NDIS" \| "Aged care" \| "Unknown"`                                                   |
| `src/data/operations.ts:157`               | `sampleClaimRate = { NDIS: 190, "Aged care": 160 }`                                             |
| `src/data/client-directory.ts:145,149–160` | `clientTotals = { all: 184, ndis: 128, agedCare: 56 }`, plan reviews and regions by two streams |
| `src/data/schedule.ts:107`                 | Session length 45 min for speech, 60 for everyone else                                          |

**AI prompts and assistant wording**

| File:line                                        | Today                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `src/lib/ai/story.ts:46`                         | Referral prompt: "delivers occupational therapy and speech pathology" |
| `src/lib/ai/story.ts:53,64,89`                   | Funding enum and normalisation                                        |
| `src/lib/ai/summarise-note.ts:4`                 | Note prompt: "(occupational therapy and speech pathology)"            |
| `src/app/api/assistant/route.ts:12`              | Assistant system prompt: OT and speech, NDIS and aged care            |
| `src/lib/knowledge/tools.ts:134`                 | Summary text: "12 clinicians (OT and Speech Pathology…)"              |
| `src/lib/knowledge/tools.ts:301,365,848,867,870` | Totals text, "12 clinicians", funding and discipline enums            |
| `src/lib/knowledge/workflows.ts:75`              | "NDIS or aged care claim"                                             |
| `src/lib/assistant.ts:109`                       | "12 clinicians are seeing 184 clients (128 NDIS, 56 aged care)"       |

**Filters, charts and labels in screens**

| File:line                                                                   | Today                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/features/overview/overview-dashboard.tsx:164–165,234–235`              | Discipline filter options; funding donut                 |
| `src/features/capacity/team-capacity.tsx:111,148–149,346`                   | "OT" / "Speech Path." groups; filter; "NDIS · AC"        |
| `src/features/analytics/analytics-dashboard.tsx:59–65,242`                  | Discipline branches; aged care series                    |
| `src/features/clients/client-directory.tsx:36,73–132,183–184`               | Funding series, captions, donut, filter                  |
| `src/features/clients/client-form.tsx:115–116`                              | Funding `<option>`s                                      |
| `src/features/caseload/client-table.tsx:120,151–152`                        | Caption and filter                                       |
| `src/features/caseload/caseload-mix.tsx:21,86–89`                           | Funding split                                            |
| `src/features/attention/attention-table.tsx:261–262,337`                    | Funding filter; tag tone                                 |
| `src/features/case-notes/case-queue.tsx:71`                                 | Funding tag tone                                         |
| `src/features/billing/billing.tsx:33,84–86,124–128,172,187–188`             | Two-stream claims and charts                             |
| `src/features/intake/new-referral.tsx:37–50`                                | Unknown funding defaults to NDIS                         |
| `src/app/admin-insights/page.tsx:25`                                        | "All 12 clinicians"                                      |
| `src/data/admin.ts:13,42`                                                   | "all 12 clinicians"; "NDIS and aged care reports"        |
| `src/data/story.ts:347` and `src/app/design-preview/_fixtures/story.ts:649` | "NDIS and aged care claims"                              |
| `src/data/forms.ts:262`                                                     | "Occupational therapy and speech pathology, home visits" |

**Docs**

| File:line                           | Today                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `CLAUDE.md:87`                      | Agreed figures: 12 clinicians, OT and speech only, 128 NDIS + 56 aged care |
| `README.md:3`                       | "12 clinicians, 184 NDIS and aged care clients"                            |
| `docs/demo-dataset.md:4,24–25,52`   | Revision 2 scope, KPI table, clinician table                               |
| `docs/screen-specs.md:8`            | "12 clinicians (OT and Speech Pathology)"                                  |
| `docs/design-spec-v2.md:625`        | "Billing and claims · NDIS and aged care"                                  |
| `scripts/demo-videos/record.py:391` | Narration: "NDIS and aged care claims"                                     |

---

## 6. Proposed features

Ranked by demo impact in section 7. Every item follows the repo's rules: tokens only, components from `src/components/ui/`, strict TypeScript, no dead controls, sentence case, Australian English, the presenter panel for developer details, fictional data only.

**Conventions for every item**

- **AI vs rules:** AI only reads, extracts, summarises or drafts. Rules decide dates, routing, statuses and amounts. People approve anything clinical or financial.
- **Every AI step:** it goes through `src/lib/ai/engine.ts`. Input text is wrapped in a delimited data block, and the system prompt says to treat it as data, never as instructions. Output follows a JSON schema in which every sentence carries `sources` (input line ids). A server-side validator rejects any sentence that has no sources, cites a line that doesn't exist, or contains a number that doesn't appear in its cited lines. Fallback: the prepared output is used only when the input is the unchanged sample; edited input shows an error with "Try again" (the existing rule). Shown as "AI draft, needs your approval" (`AiMark`).
- **Actor and time:** every action takes its actor from the current role and its time from `src/lib/clock.ts`. No hard-coded names or times; the audit found these in the store.

### F0. Store slices and tests (foundation)

1. **Purpose:** make the next features safe to build. Split the store by area and add automated checks.
2. **Fixes:** none directly; it removes the risk behind every step.
3. **Why it matters:** the store is 1,644 lines (`src/state/demo-store.ts`) with hard-coded actors and times, and there are no tests. Every item below adds actions.
4. **Type:** plain software.
5. **UX:** no visible change. Audit entries show the real role and current time.
6. **Data model:** none.
7. **State:** one persisted Zustand store built from slices: `clientsSlice`, `referralsSlice`, `agreementsSlice` (new), `scheduleSlice`, `notesSlice`, `reportsSlice`, `billingSlice`, `tasksSlice`, `portalSlice`, `settingsSlice`, `storySlice`, `auditSlice`, `uiSlice`. Shared helpers `actor(state)` and `stamp()` replace literals. Bump the `sessionStorage` version with a migration so old sessions reset cleanly. Selectors live in `src/state/selectors/*.ts`.
8. **Routes and components:** none.
9. **AI:** none.
10. **Acceptance:** `demo-store.ts` keeps only composition (under 150 lines); every slice is under about 300 lines; no string literal actor names or `"10:2x"` times remain in `src/state`; all existing screens behave as before (browser check of the connected story).
11. **Tests:** add Vitest (unit) and Playwright (browser). Unit tests for `approveSessionNote`, `bookVisit`, `completeVisit`, `advanceDay`, `figures()`. One Playwright run of the connected story from the README.
12. **Effort:** M. No dependencies. Needs approval to add the two dev dependencies.

### F1. Full discipline and funding model

1. **Purpose:** "The platform knows every service Medisense offers and every way a client is funded."
2. **Fixes:** NDIS 2, 7; workers' comp 2, 5, 6, 9; aged care 2, 8.
3. **Why it matters:** Neil will notice at once if his physios, EPs, psychologists and nurses are missing, or if workers' comp clients can't exist. Discipline filters on Overview, Capacity and Analytics then show the real team.
4. **Type:** plain software.
5. **UX:** discipline filters become a select ("All disciplines" plus 9) instead of a two-button toggle, since 10 buttons won't fit. Funding filters list the streams present in the data. Tags: "NDIS", "Workers' comp", "Aged care", "Medicare", "Private health", "Self-funded", "Life insurance". Empty state for a filter with no records: "No clients funded by {stream} yet." No loading or error states (static data).
6. **Data model:**

   ```ts
   export type Discipline =
     | "Occupational Therapy"
     | "Speech Pathology"
     | "Physiotherapy"
     | "Exercise Physiology"
     | "Psychology"
     | "Trauma Therapy"
     | "Dietetics"
     | "Podiatry"
     | "Nursing";
   /** A client group and service line, not a discipline. */
   export type ServiceLine =
     "Early childhood & paediatrics" | "Adults" | "Older adults" | "Workplace injury";
   export type FundingStream =
     | "NDIS"
     | "Workers' compensation"
     | "Aged care"
     | "Medicare"
     | "Private health insurance"
     | "Self-funded"
     | "Life insurance";
   export type ServiceLocation =
     | "Home"
     | "School"
     | "Telehealth"
     | "Daycare"
     | "Day program"
     | "Community location"
     | "Workplace"
     | "Other";
   export type FundingArrangement =
     | {
         stream: "NDIS";
         ndisNumber: string;
         planType: "Agency managed" | "Plan managed" | "Self managed";
         planStart: string;
         planEnd: string;
         fundingPeriods: string | null;
         planManagerId: string | null;
       }
     | { stream: "Workers' compensation"; claimId: string }
     | {
         stream: "Aged care";
         program: "Support at Home" | "CHSP" | "Private";
         myAgedCareId: string | null;
         classification: string | null;
         carePartnerId: string | null;
       }
     | { stream: "Medicare"; gpId: string; sessionsUsedThisYear: number }
     | {
         stream: "Private health insurance" | "Self-funded" | "Life insurance";
         payerName: string | null;
       };
   ```

   `Clinician.funding` becomes `Record<FundingStream, number>` (counts). `Clinician` gains `disciplines` only if Neil confirms some staff hold two. Fixtures: new clinicians across all 9 disciplines (number per decision 2); `src/data/disciplines.ts` holds the labels, short labels ("OT", "SP", "PT", "EP", "Psych", "Trauma", "Diet", "Pod", "RN"), default session length and note template id; `src/data/funding.ts` holds stream labels, tag tone and claim routing.

7. **State:** none new; `summarise()` sums by stream with `reduce` instead of `ndis` / `agedCare`.
8. **Routes and components:** every file in section 5. Reuse `Segmented` for ≤3 options, `select` in `FilterField` otherwise. No new components.
9. **AI:** prompts in section 5 take their discipline and stream lists from `src/data/disciplines.ts` and `src/data/funding.ts`, never from inline text.
10. **Acceptance:** `rg '"Aged care"|"Speech Pathology"' src --glob '!src/data/**'` finds no comparisons outside the label modules; the Overview discipline filter lists 9 disciplines and each one changes the figures; the clinician and client totals match `docs/demo-dataset.md` revision 3 on every screen; `pnpm check` passes.
11. **Tests:** unit test that `summarise(allScope)` totals equal the dataset doc; that every stream has a label and claim route; and that the funding-by-stream counts add up to the active client count.
12. **Effort:** M (wide but mechanical). Depends on F0 and decision 2.

### F2. Referral intake that matches the real form, with AI extraction

1. **Purpose:** "Paste or upload any referral and get the Medisense referral form filled in, every field linked to the line it came from."
2. **Fixes:** NDIS 1–2; workers' comp 1–2; aged care 1–2.
3. **Why it matters:** the strongest "wow" for Neil. Admin today re-types emails and PDFs into the Jotform fields. The screen mirrors his own form section by section, and shows what's missing against **his** required fields.
4. **Type:** AI for extraction (unstructured text). Rules for required fields and conditional logic (deterministic, copied from the form).
5. **UX:** `/intake` → **New referral** sheet becomes a two-column review: source text with line numbers on the left; the form on the right in the form's order, grouped as **Participant**, **NDIS plan**, **Plan manager** (shown only when plan type is Plan managed, then required), **Support coordinator**, **Service agreement signatory**, **Appointment booking contact**, **Service location**, **Diagnosis and safety**, **Supports requested** (frequency per ticked discipline), **Goals and comments**, **Files**.
   - For workers' comp and aged care referrals, the NDIS group is replaced by a **Workers' compensation claim** group (insurer, claim number, injury date, employer, RTW coordinator, certificate dates) or an **Aged care funding** group (program, My Aged Care ID, classification, care partner).
   - Each filled field shows a source chip ("Line 4"); focusing a field highlights its line, by keyboard as well as by mouse (fixes the audit's hover-only issue).
   - **States:**
     - Empty: "Paste referral text or upload a file."
     - Loading: skeleton fields, with "Reading referral…".
     - Error: "We couldn't read this referral. Your text is kept. Try again."
     - Success: "{n} fields filled, {m} required fields missing."
   - **Buttons:** "Read referral with AI" (existing name), "Use sample referral", "Request missing details" (drafts an email to the referrer, shown for approval, then "Request sent"), "Verify & create client" (disabled until required fields are complete; the reason is shown under the button).
   - **Upload:** a `.txt` or `.pdf` file is read in the browser into lines (PDF via a small text extractor) and nothing leaves except the extracted lines. If PDF text extraction is too heavy for the demo, accept `.txt` and `.docx` only, and say so in the hint.
6. **Data model:** `Referral` gains `form: ReferralForm` (fields 1–48 of section 2.2, typed, with `null` for unknown) and `stream: FundingStream`. `ReferralSource` adds "Contact form", "Insurer", "Care partner". Enquirer role: `"Participant" | "Guardian" | "Support Coordinator" | "Other"`. Supports are typed as `{ support: SupportRequested; frequency: "Assessment" | "Weekly" | "Fortnightly" | "Monthly" | "Other" }`. Fixtures: rewrite the existing referrals (`src/data/referrals.ts`) against the form, and add one workers' comp and one aged care referral.
7. **State:** `referralsSlice` gains `setReferralField(id, field, value)`, `requestMissing(id)`, `verifyReferral(id)` (creates the client, contacts and funding arrangement, and moves the referral to "Profile created"). Selector `missingRequired(referral)` implements the form's conditional rules (`rules/referral-form.ts`).
8. **Routes and components:** `/intake` (`src/features/intake/new-referral.tsx`, `intake-workspace.tsx`, which must also be split below about 250 lines). Reuse `Sheet`, `Field`, `Tag`, `AiMark`. New: `ReferralFormSection` (one form group with its conditional fields), needed because the form has 11 groups.
9. **AI:** input = numbered lines, wrapped as data. Output = `ReferralForm` with per-field `{ value, line, confidence }` plus `stream` and `missing`. Guardrails: a value must appear in its line (normalised comparison, server-side check); dates must parse; NDIS number must be 9 digits or else marked "Check"; no clinical inference beyond the stated diagnosis text. Fallback: prepared extraction for the unchanged sample only.
10. **Acceptance:**
    - With the sample, "Read referral with AI" fills every present field with a line number.
    - Setting Plan type to "Plan managed" reveals Plan manager company and email and marks both required.
    - Behaviours of concern = Yes reveals the details field.
    - "Verify & create client" creates exactly one client, one funding arrangement and one contact per named person, and the referral shows "Profile created".
    - Overview "Referrals in progress" changes by 1.
11. **Tests:** unit tests for `missingRequired` covering every conditional rule in section 2.2, and for the server validator rejecting a value not found on its line. Browser test: sample referral, then extract, then fix the missing field, then create the client.
12. **Effort:** M–L. Depends on F1 and F3.

### F3. Referrer and contact records, with automatic status updates

1. **Purpose:** "Every support coordinator, guardian, plan manager, insurer, employer, GP and family member is a contact you can reuse, and they hear back automatically at the right moments."
2. **Fixes:** NDIS 1, 4, 6, 14, 16; workers' comp 1–2, 13; aged care 1, 12.
3. **Why it matters:** coordinators and insurers chase providers for updates. "Referral received", "First visit booked", "Report sent" going out automatically, after approval, removes a daily admin job.
4. **Type:** plain software and rules. The update text is a fixed template per event, not AI, because it's predictable.
5. **UX:**
   - **Contacts** tab on the client profile: name, role, organisation, preferred method and time, flags "Signs agreements", "Books appointments", "Receives reports".
   - **Contacts** list at `/clients/contacts`: search and filter by role; empty state "No contacts match."
   - **Updates** card on the client profile listing queued updates as "Ready to send" / "Sent {time}" / "Off for this contact". Updates queue rather than send: "Send update" per item, or "Send all {n}".
   - Settings: a "Status updates" rule list (reuses the automations table) with toggles per event.
6. **Data model:**

   ```ts
   type ContactRole =
     | "Participant"
     | "Guardian/Nominee"
     | "CSO/OPG"
     | "Support coordinator"
     | "Plan manager"
     | "Insurer case manager"
     | "Employer RTW coordinator"
     | "GP"
     | "Family member"
     | "Care partner"
     | "School"
     | "Other";
   type Contact = {
     id: string;
     name: string;
     role: ContactRole;
     organisation: string | null;
     email: string | null;
     phone: string | null;
     preferredMethod: "Phone call" | "Text message" | "Email" | "Other" | null;
     preferredTime: string | null;
   };
   type ClientContact = {
     clientId: string;
     contactId: string;
     signsAgreements: boolean;
     booksAppointments: boolean;
     receivesReports: boolean;
     receivesUpdates: boolean;
   };
   type StatusUpdate = {
     id: string;
     clientId: string;
     contactId: string;
     event:
       "Referral received" | "First visit booked" | "Agreement sent" | "Report sent" | "Discharged";
     status: "Ready to send" | "Sent";
     sentAt: string | null;
   };
   ```

   Migrate the free-text `contacts` in `src/data/client-profiles.ts:123–125,276–278,417–418,543–544` to records.

7. **State:** `contactsSlice` with `addContact`, `linkContact(clientId, contactId, flags)`, `queueUpdate(event)`, `sendUpdate(id)`. Rule `updatesFor(event, client)` returns the recipients with "Receives updates".
8. **Routes and components:** `/clients/[clientId]` (new tab), new `/clients/contacts` (linked from Clients; no new sidebar entry). Reuse the directory table pattern. No new components.
9. **AI:** none.
10. **Acceptance:** booking Leila's first visit queues exactly one "First visit booked" update to the booking contact and one to the support coordinator; "Send all 2" marks both Sent and writes 2 audit entries; turning the rule off queues nothing.
11. **Tests:** unit tests for `updatesFor` per event and stream, and for the employer receiving only "Report sent" with no clinical text.
12. **Effort:** M. Depends on F1.

### F4. Digital service agreement and consent

1. **Purpose:** "The service agreement writes itself from the referral, goes to the right person, and you can see who hasn't signed."
2. **Fixes:** NDIS 4, 11 (cancellation terms); workers' comp 4; aged care 4.
3. **Why it matters:** the form shows Medisense already builds agreements from referral data (signatory, date, pricing zone, support lines). Doing it in one click, with signing in the family portal, is a clear before-and-after.
4. **Type:** rules build the agreement (lines from supports and frequency; pricing zone from the address state; the 48-hour clause from policy). No AI is needed: the content is structured.
5. **UX:**
   - Client profile → **Agreement** tab.
     - Empty: "No agreement yet. Prepare one from the referral."
     - **Prepare service agreement** opens a sheet: signatory (prefilled from the referral), start and end (to plan end), pricing zone (QLD / Remote / Very remote), lines (discipline, support line label, hours per period, travel yes/no, sample rate), the cancellation clause ("48 hours' notice to cancel or reschedule"), and consents (treatment; share with named contacts).
     - Buttons: "Save draft", "Send for signature".
   - **Statuses:** "Draft", "Sent for signature", "Signed", "Ended". "Signed" shows a dashed "Sample signature" panel with name and time; it is never presented as a legal signature.
   - The family portal shows **Review and sign** with "Sign agreement" for the signatory. Unsigned after 3 working days → rule reminder task "Chase unsigned agreement".
   - Workers' comp consent has two scopes: "Insurer: reports and invoices" and "Employer: work capacity and duties only".
6. **Data model:**

   ```ts
   type AgreementLine = {
     id: string;
     discipline: Discipline;
     label: string;
     hoursPerPeriod: number;
     period: "Week" | "Fortnight" | "Month" | "Plan";
     travel: boolean;
     sampleRate: number;
   };
   type Consent = {
     kind: "Treatment" | "Share information" | "Telehealth";
     contactIds: string[];
     scope: string | null;
     given: boolean;
   };
   type ServiceAgreement = {
     id: string;
     clientId: string;
     stream: FundingStream;
     signatoryId: string;
     status: "Draft" | "Sent for signature" | "Signed" | "Ended";
     start: string;
     end: string;
     pricingZone: "QLD" | "Remote" | "Very remote";
     lines: AgreementLine[];
     cancellationNoticeHours: 48;
     consents: Consent[];
     sentAt: string | null;
     signedAt: string | null;
   };
   ```

   `Client → FundingArrangement → ServiceAgreement (1 active) → AgreementLine[]`.

7. **State:** `agreementsSlice` with `prepareAgreement(clientId)` (rule-built), `editAgreementLine`, `sendAgreement`, `signAgreement` (portal), `endAgreement`. Selectors `activeAgreement(clientId)`, `unsignedAgreements()` (Admin queue and Overview).
8. **Routes and components:** `/clients/[clientId]` Agreement tab; `/portal` and `/mobile/family` "Review and sign"; `/admin-queue` row type "Unsigned agreement". Reuse `Sheet`, form fields and `Tag`. New: `AgreementDocument` (read-only print view, also used for "Download PDF" via the browser's print to PDF), needed because no document view exists.
9. **AI:** none.
10. **Acceptance:** for Leila (OT weekly, speech fortnightly, QLD), Prepare creates 4 lines (OT, OT travel, speech, speech travel) with the 48-hour clause; Send queues an update to the signatory (F3); signing in the portal sets Signed and the audit names the signatory; the Admin queue count of unsigned agreements drops by 1.
11. **Tests:** unit tests for line building from supports and frequency, the pricing zone from the address state, and the reminder after 3 working days (skipping weekends).
12. **Effort:** M. Depends on F1, F2 and F3.

### F5. Therapist matching

1. **Purpose:** "Suggests the best therapists for a new client, and explains why."
2. **Fixes:** NDIS 5, 9; workers' comp 5, 8; aged care 5.
3. **Why it matters:** builds on the capacity story (Sarah At Risk). Matching never suggests an At Risk clinician first, which ties the new front door to the existing caseload logic.
4. **Type:** rules. The ranking is a transparent score: discipline required (filter), region and travel minutes (from suburbs in `src/data/schedule.ts:38`), free capacity in weighted units, status (At Risk last), continuity (already sees a sibling or the same family), safety (therapist-risk flag → requires a senior clinician; required person present → only times when that person is available, if known). No AI: the criteria are explicit and need to be explainable.
5. **UX:** after "Verify & create client", a **Match therapists** panel lists one card per requested discipline: top 3 clinicians, each with reasons as chips ("Brisbane North · 12 min", "4 places free", "Healthy"), plus "Next free: Thu 9:30 am".
   - Buttons: "Book first visit" (opens `BookVisitSheet` prefilled) and "Choose someone else" (full list).
   - Booking is limited to Monday to Friday, 9:00 am to 5:00 pm.
   - Empty: "No {discipline} clinician has room in Brisbane North this week. Show Brisbane South?"
   - Recurring sessions: after the first visit, "Set up schedule" creates the series from the requested frequency (weekly or fortnightly, 8 weeks), with clashes listed before confirming.
6. **Data model:** `MatchReason = { label: string; points: number }`; `Match = { clinicianId; score; reasons: MatchReason[]; nextFree: { day; start } | null }`. Clinicians gain `seniority: "Graduate" | "Clinician" | "Senior"` (fixture).
7. **State:** pure selector `matchClinicians(client, discipline, state)` in `src/state/selectors/matching.ts`; `bookSeries(visit, frequency, weeks)` in `scheduleSlice`.
8. **Routes and components:** `/intake` (after create), `/clients/[clientId]`. Reuse `BookVisitSheet` (`src/features/schedule/book-visit.tsx`), `Tag`, `CapacityMeter`. No new components.
9. **AI:** none.
10. **Acceptance:** for Leila, the OT list never puts Sarah Thompson first (At Risk) and shows Emma Clarke above her (same region, Healthy, available), consistent with the capacity story; booking outside 9–5 or at a weekend is not offered; "Set up schedule" weekly for 8 weeks creates 8 visits, skipping clashes, and lists any skipped.
11. **Tests:** unit tests for score ordering, the hours rule, series creation with clashes and weekends, and the risk flag requiring a Senior.
12. **Effort:** S–M. Depends on F1 and F2.

### F6. Cancellations under the 48-hour rule, plus no-shows

1. **Purpose:** "Cancel a visit and the platform applies your 48-hour policy, offers the next slot, and handles the claim."
2. **Fixes:** NDIS 11; workers' comp 10; aged care 10.
3. **Why it matters:** the 48-hour policy is on Medisense's own site. Short-notice cancellations are lost revenue and admin back-and-forth.
4. **Type:** rules (deterministic).
5. **UX:** visit drawer → **Cancel visit** opens a dialog: "Who cancelled?" (client side / Medisense), "When were we told?" (defaults to now). It then shows the calculation: "Notice given: 31 hours. Less than 48 hours." Options:
   - "Record short-notice cancellation" (client side, under 48 h; creates a claim line if the stream and agreement allow it, otherwise "Not claimable under this funding")
   - "Record cancellation" (48 h or more, or Medisense cancelled)
   - "Mark as no-show" (from the visit time onwards)

   Then "Offer next time" shows the next 3 free slots for the same clinician with "Book" and queues an update to the booking contact. Visit statuses: "Booked", "Completed", "Cancelled", "Cancelled · short notice", "No-show". The schedule legend gains these; the cancelled pattern uses a token, not the current gradient.

6. **Data model:** `ScheduleItem.status` adds `"short-notice"` and `"no-show"`; `cancellation: { by: "Client" | "Medisense"; noticeHours: number; claimable: boolean } | null`.
7. **State:** `scheduleSlice.cancelVisit(visitId, { by, toldAt })` uses `rules/cancellation.ts` `classify(visitStart, toldAt, policyHours=48)`, counting clock hours. Whether notice counts business hours is an open question (section 8). `billingSlice` derives a cancellation line when `claimable`.
8. **Routes and components:** `/schedule`, `/my-day`, staff app visit sheet. Reuse `Dialog`, `Tag`. No new components.
9. **AI:** none.
10. **Acceptance:** cancelling Ruby Cooper's visit 31 hours ahead as client-side shows "Less than 48 hours" and creates exactly one claim line marked "Short-notice cancellation" in `/billing` for an NDIS client; the same at 50 hours creates none; a no-show changes the attendance chart in the client profile.
11. **Tests:** unit tests for `classify` at 47:59, 48:00 and 48:01, Medisense-initiated, no-show, and each stream's claimability.
12. **Effort:** S. Depends on F0; F8 for claim lines.

### F7. Assessment → report → shared care plan

1. **Purpose:** "The first assessment becomes a report, and the approved report becomes one care plan that every therapist on the case works from."
2. **Fixes:** NDIS 7–9; workers' comp 6–7; aged care 6, 8.
3. **Why it matters:** this is Medisense's stated process (OT page: assessment → tailored plan → schedule). Multidisciplinary care is a "why us" claim on their site, and today it lives in separate documents.
4. **Type:** AI drafts the assessment report from the approved assessment note(s), because it summarises clinical text. Rules turn approved report goals into care plan goals and set the review date (plan end − 8 weeks for NDIS; from the approval end for workers' comp; 6 months for aged care, to confirm). People approve the report and the plan.
5. **UX:**
   - New visit type **Initial assessment** in booking.
   - After its note is approved, **What AI prepared** offers "Draft assessment report", using the existing prepared view pattern.
   - The report sheet has sections per type, from `src/data/reports-library.ts:49+`. Each sentence has a source chip. Section actions: "Edit", "Regenerate section" (both wired), then "Approve report".
   - Approving offers "Create care plan from this report". The **Care plan** tab on the client profile shows:
     - goals with owner disciplines (several per goal), measure, baseline, target and review date
     - "Add discipline" (adds a therapist from matching, F5)
     - "Approve care plan"
   - Statuses: "Draft", "Approved", "Review due".
   - Family portal shows the approved plan in plain words.
   - States: empty "No care plan yet. It starts from an approved assessment report."; loading skeleton; error "We couldn't draft the report. Your notes are kept. Try again."
6. **Data model:**

   ```ts
   type CarePlanGoal = {
     id: string;
     text: string;
     domain: string;
     disciplines: Discipline[];
     measure: string;
     baseline: string;
     target: string;
     sourceReportId: string;
     status: GoalStatus;
   };
   type CarePlan = {
     id: string;
     clientId: string;
     status: "Draft" | "Approved" | "Review due";
     goals: CarePlanGoal[];
     disciplines: Discipline[];
     reviewDue: string;
     approvedBy: string | null;
   };
   type AssessmentReport = {
     id: string;
     clientId: string;
     type: ReportType;
     noteIds: string[];
     sections: ReportSection[];
     status: ReportStatus;
   };
   ```

   `ClientGoal` (`src/data/client-profiles.ts:6`) becomes a view over `CarePlanGoal`. Chain: `Client → ServiceAgreement → CarePlan → Appointments → Notes → Reports / ClaimLines`.

7. **State:** `reportsSlice.draftAssessmentReport(noteIds)`, `editReportSection`, `regenerateSection`, `approveReport`; `carePlansSlice.createFromReport`, `addDiscipline`, `approveCarePlan`. Selector `reviewDue(clientId)`.
8. **Routes and components:** `/sessions/[visitId]` (generalise from `oliver-grant`; the audit flagged single-record routes), `/sessions/[visitId]/prepared`, `/clients/[clientId]` Care plan tab, `/reports`. Reuse `prepared-view.tsx` parts (split it first: 733 lines), `AiMark`, `Provenance`. New: `GoalOwners` chips. Small, but used on three screens.
9. **AI:** input = approved note sentences with ids, plus referral goals as data. Output = sections with sentences and `sources`. Guardrails: no diagnoses, scores or risk ratings beyond the note; the numbers check; sections with no source stay empty and say "Not covered in the notes". Fallback: prepared report for the sample note only.
10. **Acceptance:** approving Leila's OT assessment note offers "Draft assessment report"; the approved report creates a care plan with goals linked to report sentences; adding Speech Pathology adds a discipline chip to the relevant goals; the family portal shows the approved plan; editing then regenerating a section only replaces that section.
11. **Tests:** unit tests for goal creation from a report, the review-date rule per stream, and the validator rejecting an unsourced sentence. Browser test: assessment note → report → care plan → portal.
12. **Effort:** L. Depends on F0, F1 and F5.

### F8. Claims and invoices by funding stream

1. **Purpose:** "Every approved session becomes the right claim or invoice for whoever pays, ready to check."
2. **Fixes:** NDIS 12; workers' comp 11; aged care 11.
3. **Why it matters:** billing is where admin time and cash flow meet. Showing that plan type decides the route (from Medisense's own form) is credible to a director.
4. **Type:** rules (amounts, routing, hold until the note is approved). The existing AI claims summary stays as a one-line explanation (`kind: "claims"`). Admin approves each batch.
5. **UX:** `/billing` groups by **Pay to**:
   - "NDIA (agency managed)": batch file draft
   - "Plan managers": one invoice per plan manager
   - "Participants (self managed)"
   - "Insurers": per claim number
   - "Care partners"
   - "Medicare / private / self-funded"

   Each line shows client, date, support line label, hours, travel, sample rate and amount. Short-notice cancellations get a "Short notice" tag. Lines waiting for an approved note show "Waiting for note", the existing rule. Buttons: "Approve batch", which becomes "Batch approved"; "Download invoice (PDF)" via print view; "Download claim file (CSV)", the existing export pattern. A "Sample rates" note sits under the totals.

6. **Data model:** `ClaimLine = { id; visitId | null; clientId; payTo: PayTo; label; hours; travelHours; rate; amount; kind: "Session" | "Travel" | "Short-notice cancellation"; status: "Waiting for note" | "Ready" | "Approved" }`; `PayTo = { kind: "NDIA" | "Plan manager" | "Participant" | "Insurer" | "Care partner" | "Medicare" | "Private"; contactId: string | null }`. Rates come from `AgreementLine.sampleRate` (F4) instead of `sampleClaimRate`.
7. **State:** selector `claimLines(state)` derived from completed visits, cancellations, agreements and note approvals (no stored copies); `billingSlice.approveBatch(payToKey)`. This removes the seeded guess at `billing.tsx:84–86`.
8. **Routes and components:** `/billing` (split `billing.tsx`, 360 lines). Reuse charts and `Tag`. New: `InvoiceDocument` print view (shares a layout with `AgreementDocument`).
9. **AI:** unchanged (one-line summary, facts only).
10. **Acceptance:** approving Leila's session note moves her line from "Waiting for note" to "Ready" under her plan manager; a short-notice cancellation adds a line with that tag; "Approve batch" for a plan manager writes one audit entry and the batch total matches the sum of its lines.
11. **Tests:** unit tests for routing per plan type and stream, the hold rule, travel lines and cancellation lines.
12. **Effort:** M. Depends on F1, F4 and F6.

### F9. Workers' compensation journey

1. **Purpose:** "Injured workers are tracked from claim to return to work, with the insurer and employer kept informed, and approvals never running out by surprise."
2. **Fixes:** all workers' comp steps.
3. **Why it matters:** a whole service line on Medisense's site with nothing in the demo. One report, three audiences (insurer, employer, GP) is a strong AI moment.
4. **Type:**
   - **Rules:** approved sessions used versus remaining (flag at 2 left), certificate expiry, and report cadence (every 4 weeks or as the insurer asks).
   - **AI:** drafts the progress and RTW report, and the employer summary limited to capacity and duties.
   - **People:** approve before sending.
5. **UX:** client profile header for workers' comp shows "Claim {number} · {insurer} · Sessions {used} of {approved}" and "Certificate until {date}". **Workers' comp** tab:
   - claim details
   - approvals by discipline with "Request more sessions" (AI drafts a request from recent notes; "Send to insurer" after approval)
   - certificates list with "Add certificate"
   - RTW goals from the care plan

   Report sheet "Progress and return-to-work report" has two tabs, "For insurer" and "For employer". The employer tab is checked by a rule that blocks diagnosis and treatment detail and shows "Only work capacity and duties are included". Statuses: "Draft", "Approved", "Sent". The Overview filter by stream includes workers' comp.

6. **Data model:** `WorkersCompClaim = { id; clientId; insurerContactId; caseManagerContactId; employerContactId; rtwCoordinatorContactId; claimNumber; injuryDate; injury; approvals: { discipline: Discipline; approved: number; used: number }[]; certificates: { from; to; capacity: "Full duties" | "Suitable duties" | "No capacity"; hoursPerWeek: number | null }[] }`. Fixtures: Daniel (lower back), physio and EP, 2 certificates; one more claim at 1 session remaining for the flag.
7. **State:** `claimsSlice` with `addCertificate`, `requestMoreSessions`, `recordApproval`. Selectors `sessionsRemaining`, `certificateExpiring`. The `ReportType` union gains `"Progress and return-to-work report"`.
8. **Routes and components:** `/clients/[clientId]` (tab), `/reports`, `/billing` (insurer invoices). Reuse report sheet from F7. No new components.
9. **AI:** input = approved notes, care plan goals and certificate facts as data. Output = two documents with sourced sentences. Extra guardrail: the employer version is generated from the insurer version's capacity and duties sentences only, and a validator rejects medical terms from a blocklist (diagnosis words, medication). Fallback: prepared pair for Daniel's sample.
10. **Acceptance:** completing Daniel's 10th of 12 approved physio sessions raises "2 sessions left. Request more?" in the Admin queue; the employer version contains no sentence sourced from a note's Subjective or Assessment; sending creates updates to the insurer and employer (F3) and an insurer invoice line (F8).
11. **Tests:** unit tests for sessions remaining, certificate expiry, and the employer-summary filter. Browser test: approve the session note → request more sessions → report → send.
12. **Effort:** L. Depends on F1, F3, F7 and F8.

### F10. Aged care journey: home safety, AT prescription and family

1. **Purpose:** "From a home safety visit to an assistive technology prescription and home modification report, with the family in the loop."
2. **Fixes:** aged care 2–3, 6–9, 11–13.
3. **Why it matters:** on the home page and services page. It reuses the existing Ruth Hallam profile and the home modification form, making them real.
4. **Type:**
   - **AI:** drafts the AT prescription and home modification report from the OT's assessment notes.
   - **Rules:** the reassessment cadence, quote needed above the low-cost threshold (sample value, to confirm), and family updates after an approved note (if consented).
   - **People:** approve.
5. **UX:** Ruth Hallam → **Home safety** tab: rooms checklist from the assessment note (bathroom, bedroom, entry, kitchen) with findings; recommendations with items, each "Low cost" or "Needs quote"; "Draft AT and home modification report"; then "Send to care partner". Funding card: program, classification, care partner and "Budget used {x} of {y}" (sample). Family portal for the daughter shows visits, the approved plan and updates. Statuses: "Draft", "Approved", "Sent", "Quote requested".
6. **Data model:** `AgedCareDetails` per F1; `HomeSafetyFinding = { area; finding; risk: "High" | "Medium" | "Low"; source: sentenceId }`; `ATRecommendation = { item; reason; cost: "Low cost" | "Needs quote"; findingId }`. `ReportType` gains `"AT prescription and home modification report"` (or reuses the existing two types; to decide in design).
7. **State:** `reportsSlice` (reuse), `agedCareSlice.requestQuote`, the reassessment selector.
8. **Routes and components:** `/clients/ruth-hallam` (tab), `/forms` (home modification form prefilled from the approved report rather than hard-coded values), `/portal` (family member variant). No new components.
9. **AI:** as F7. Each recommendation must cite a finding, and each finding a note line.
10. **Acceptance:** approving Ruth's home safety note lets "Draft AT and home modification report" produce findings and recommendations each linked to a line; approving fills the home modification form fields from the report (source "Approved report"); the family portal shows the plan; reassessment appears in the Admin queue 6 months on (via "Advance" in the presenter panel).
11. **Tests:** unit tests for the threshold rule, reassessment dates and form prefill mapping.
12. **Effort:** M–L. Depends on F1, F3 and F7.

### F11. Reports that come due by themselves, to the right people

1. **Purpose:** "Reports are scheduled from plan and claim dates, drafted from approved notes, and sent to the right recipients."
2. **Fixes:** NDIS 14–15; workers' comp 13; aged care 12–13.
3. **Why it matters:** late NDIS progress reports before a plan review hurt participants and referrer relationships. It's a problem Neil will recognise.
4. **Type:** rules decide due dates and recipients; AI drafts (reusing F7); people approve.
5. **UX:** `/reports` gains a **Due soon** column: "NDIS progress report · Leila Haddad · due {plan end − 6 weeks}" (cadence to confirm). Recipients are prefilled from contacts with "Receives reports" ("Support coordinator, Guardian"), each removable. "Draft report" becomes "Approve report", then "Send to {n}", then "Sent". The plan end comes from the funding arrangement; a new plan ("Record new plan") updates the agreement end and the care plan review date.
6. **Data model:** `ReportSchedule = { clientId; type; due: string; recipients: string[] }` (derived). `LibraryReport` gains `recipients` and `sentAt`.
7. **State:** selector `reportsDue(state)`; `reportsSlice.sendReport`; `fundingSlice.recordNewPlan`.
8. **Routes and components:** `/reports`, `/clients/[clientId]`, Overview "Reports due" count. Reuse. No new components.
9. **AI:** reuses F7.
10. **Acceptance:** Leila's plan ending in 10 weeks shows an NDIS progress report due in 4 weeks; Send writes one audit entry per recipient and moves the Overview "Reports due" figure down by 1; recording a new plan moves the next due date.
11. **Tests:** unit tests for due-date rules per stream and recipient selection.
12. **Effort:** M. Depends on F3 and F7.

### F12. Discharge and review

1. **Purpose:** "Close an episode properly: discharge summary, final claim, agreement ended, everyone told."
2. **Fixes:** NDIS 15–16; workers' comp 15; aged care 13–14.
3. **Type:** AI drafts the discharge summary (type exists, `src/data/reports-library.ts:92`); rules handle the checklist; a person approves.
4. **Why it matters:** completes every journey and the client list stops growing forever. Discharged clients drop out of caseload figures.
5. **UX:** client profile → "Start discharge" opens a checklist: reason ("Goals met", "Plan ended", "Moved away", "Returned to work", "Client choice", "Other"); last visit; "Draft discharge summary"; open tasks ("3 open tasks will be closed"); future visits ("2 visits will be cancelled"); final claim lines; agreement end; recipients. Then "Confirm discharge". Status "Discharged", with a "Reopen" option within 30 days. Directory filter "Discharged".
6. **Data model:** client `state` adds "Discharged"; `Discharge = { clientId; reason; date; summaryReportId; byUser }`.
7. **State:** `clientsSlice.discharge(clientId, reason)` cascades: cancel future visits (Medisense-initiated, not claimable), close tasks, end the agreement, queue updates; `reopen`. Selectors exclude discharged clients from active counts.
8. **Routes and components:** `/clients/[clientId]`, `/clients`. Reuse. No new components.
9. **AI:** reuses F7 with the discharge sections.
10. **Acceptance:** discharging Daniel cancels his future visits, closes his open tasks, ends his agreement, adds a final invoice, queues updates to the insurer and employer, and the Overview active clients figure drops by 1.
11. **Tests:** unit test for the cascade and for reopening.
12. **Effort:** M. Depends on F3, F4, F7 and F8.

### F13. Telehealth as a first-class visit type

1. **Purpose:** "Telehealth visits book, run and get noted like home visits, with consent checked."
2. **Fixes:** location step across journeys.
3. **Type:** plain software and rules (telehealth consent required before booking).
4. **Why it matters:** on the services page. `/telehealth` exists as a roadmap screen, but it isn't joined to booking, consent or notes.
5. **UX:** booking "Telehealth" checks for a consent ("Telehealth consent needed. Send consent form?"); visits show "Send link" (queues an update with a sample link, labelled sample); "Start visit" opens `/telehealth` for that visit; notes record the location "Telehealth".
6. **Data model:** `Consent.kind` already includes "Telehealth" (F4).
7. **State:** booking rule `needsTelehealthConsent`.
8. **Routes and components:** `/schedule`, `/telehealth?visit=…`. No new components.
9. **AI:** existing note flow.
10. **Acceptance:** booking telehealth for a client without consent is blocked with the message above; after consent, "Start visit" opens the room for that visit and its note shows Telehealth.
11. **Tests:** unit test for the consent rule.
12. **Effort:** S. Depends on F4.

### F14. Medicare, private health, self-funded and life insurance clients

1. **Purpose:** "Clients who pay through Medicare, private health or themselves fit the same workflow."
2. **Fixes:** funding gaps named on `/contact/`, `/psychology/` and `/brisbane/`.
3. **Type:** rules (session count per calendar year for Medicare, to confirm; GP letter after the first and last sessions, to confirm).
4. **Why it matters:** smaller, but it stops "what about our Medicare clients?" from being a gap.
5. **UX:** funding card variants; Medicare shows "Sessions this year {n} of {limit}" and "Letter to GP due"; invoices route to the client (F8).
6. **Data model:** per F1.
7. **State:** selectors only.
8. **Routes and components:** client profile, billing. No new components.
9. **AI:** GP letter drafts reuse F7 (short template).
10. **Acceptance:** one psychology client under Medicare shows the counter and a GP letter due after the first session.
11. **Tests:** unit test for the counter reset at the calendar year.
12. **Effort:** S–M. Depends on F1 and F8.

---

## 7. Releases

Ranked by demo impact (most first): F2, F4, F7, F9, F6, F5, F8, F10, F3, F11, F12, F1, F13, F14. Foundations (F0, F1) lead each release because the impact items depend on them.

### Release 1: the NDIS journey, done the Medisense way (about 5–6 weeks)

Closes the hero flow on Medisense's own workflow: Leila's referral → client → agreement signed → therapist matched and booked → session note approved (existing story) → claim routed by plan type, with the 48-hour rule.

| Order | Item                                      | Effort | Depends on     |
| ----- | ----------------------------------------- | ------ | -------------- |
| 1     | F0 Store slices and tests                 | M      | —              |
| 2     | F1 Full discipline and funding model      | M      | F0, decision 2 |
| 3     | F3 Contacts and status updates            | M      | F1             |
| 4     | F2 Referral intake matching the real form | M–L    | F1, F3         |
| 5     | F4 Service agreement and consent          | M      | F2, F3         |
| 6     | F5 Therapist matching                     | S–M    | F2             |
| 7     | F6 48-hour cancellations and no-shows     | S      | F0             |
| 8     | F8 Claims by funding stream               | M      | F4, F6         |

### Release 2: care plans, workers' compensation and aged care (about 4–5 weeks)

| Order | Item                                      | Effort | Depends on |
| ----- | ----------------------------------------- | ------ | ---------- |
| 1     | F7 Assessment → report → shared care plan | L      | R1         |
| 2     | F11 Reports due by themselves             | M      | F3, F7     |
| 3     | F9 Workers' compensation journey          | L      | F7, F8     |
| 4     | F10 Aged care journey                     | M–L    | F7         |

### Release 3: depth and polish (about 2–3 weeks)

| Order | Item                                                                                                                                                                                                                                                                                                         | Effort | Depends on |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- |
| 1     | F12 Discharge and review                                                                                                                                                                                                                                                                                     | M      | R2         |
| 2     | F13 Telehealth as a visit type                                                                                                                                                                                                                                                                               | S      | F4         |
| 3     | F14 Medicare, private, self-funded, life insurance                                                                                                                                                                                                                                                           | S–M    | F8         |
| 4     | Polish: split the remaining large components (`staff-app.tsx` 1,065, `session-note.tsx` 763, `prepared-view.tsx` 733, `schedule-workspace.tsx` 642 lines), accessibility pass on new screens, update `docs/demo-dataset.md` revision 3 and `docs/screen-specs.md`, README walkthrough for the three journeys | M      | —          |

**Phase B process notes**

- **Design first.** Each item with new UI gets a static mock-up for approval first. `/design-preview/*` paths currently redirect to the real screens (`next.config.ts:11–25`), so new mock-ups need new paths, for example `/design-preview/v3/agreement`, excluded from the redirects. Confirm that's acceptable.
- **No build while dev runs.** `pnpm build` must not run while `pnpm dev` is running on your machine. I'll run `pnpm check`, the tests and a browser check, and ask before any build.
- **Commits.** `CLAUDE.md` says no attribution trailers in commits. I'll follow that unless you say otherwise.

---

## 8. Risks and open questions

**Decisions needed from you before Phase B**

1. **Product name.** This brief says CareFlow. `CLAUDE.md` and my notes say the product stays **Medisense** and is not called CareFlow. Which name goes in the product UI?
2. **Website versus agreed figures.** `CLAUDE.md:87` records figures agreed with the client: 12 clinicians, OT and speech only, 184 clients (128 NDIS, 56 aged care), and so on. This brief says the website wins. If so:
   - How many clinicians per discipline?
   - Does the 184 stay, and how does it split across streams?
   - Do Sarah's figures (27 clients, score 83, At Risk) stay?

   My suggestion: keep 184 clients and every story figure, and grow the team to about 20 across 9 disciplines.

3. **Upload in intake.** Is reading a PDF in the browser required, or are pasted text and `.txt` / `.docx` enough for the demo?
4. **Test tooling.** OK to add Vitest and Playwright as dev dependencies?
5. **Design-preview paths** (see section 7).

**For Neil to confirm (things the website doesn't settle)**

6. NDIS registration status. The site says "registered NDIS provider", but the About page doesn't mention it. Which registration groups?
7. The current practice management system, so integration copy can stay generic but accurate.
8. How the 48 hours is counted (clock hours or business hours), and whether short-notice cancellations are charged per stream.
9. Workers' comp: the main insurers (WorkCover Queensland, self-insurers, others), report cadence, and whether employer contact happens at all.
10. Aged care: is Medisense a registered Support at Home provider or a subcontractor to care partners? Is it involved in AT-HM prescriptions?
11. Are school, daycare and community visits common, given the site says "home only" but the form offers them?
12. Does a paediatrician work with Medisense? The home page mentions one; the paediatrics page doesn't.
13. Medicare and private health: which disciplines bill these, and is a GP letter workflow wanted?
14. Life insurance partnerships: which insurers, and do they follow the workers' comp pattern?

**Risks**

- **Scope creep.** 15 items is a lot for a pitch. If time is short, Release 1 alone tells a complete, Medisense-true NDIS story.
- **Regulatory detail.** NDIS item numbers, price limits, cancellation rules and the AT-HM threshold change over time. The demo uses labelled sample rates and generic line labels, never real item numbers or prices presented as current.
- **Changing agreed figures.** This could break consistency across about 40 files and the docs. F1 makes these derived, so it's one change, but the figures must be decided first.
- **Privacy.** Uploads and live AI must only ever see fictional data. The upload hint will say "Use sample documents only".
- **Large-file debt.** Several features land in files over 600 lines. Each feature splits what it touches, which adds about 10–20% to its effort and is included in the estimates above.
