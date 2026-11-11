# Medisense: manual test guide

This guide takes one fictional patient through every workflow in the functional requirements:

- referral
- intake
- clinical triage
- funding
- matching
- assessment
- treatment plan
- visits (in person and telehealth)
- notes
- billing
- review
- discharge
- the patient app

Each step says what to do and what you should see (**Expect**). Allow about 60–90 minutes.

## Before you start

1. **Restart the dev server** (`Ctrl+C`, then `pnpm dev`). On start it adds therapist credentials
   and the new database indexes.
2. Use **three browser windows**, so the three people stay signed in at once:

   | Window | Who | Sign in as |
   |---|---|---|
   | A | Jo Marsh: Intake Officer, Scheduler, Finance | `jo.marsh@medisense.test` |
   | B | Neil Hensley: Super Admin, Clinical Lead | `neil.hensley@medisense.test` (private window or another browser) |
   | C | The therapist the patient is matched with (usually Daniel Okafor) | `daniel.okafor@medisense.test` |

   Staff passwords are `SEED_PASSWORD` in `.env.local`. You'll also need a fourth, **private**
   window for the referrer and the patient.
3. Test data (all fictional). Write it down: you'll need the date of birth again for the video
   visit.

   | Field | Value |
   |---|---|
   | Participant | **Mia Testcase**, born **2015-05-20** |
   | Address | 12 Sample Road, Carindale QLD **4152** |
   | Participant email | `mia.family@example.test` |
   | Referrer | Casey Coord (support coordinator), `casey@example.test`, 0400 111 222 |

---

## Part A: Referral to acceptance (lifecycle steps 1–5)

### A1. Send the referral (no account)
In the private window, open **`/refer`**. Fill in the nine steps:

1. **About you:** *Support coordinator*, your name, then tick the authority declaration.
2. **Participant:** the test data above.
3. **Funding:**
   - NDIS, any 9-digit number, plan end date next year
   - **Plan Managed**; leave the plan manager empty
   - Funding periods: *Unknown*
4. **Contacts:** the signatory and booking contact are a parent, with a phone number.
5. **Service location:** *Home*, same address.
6. **Supports:** **Functional Capacity Assessment** and **Occupational Therapy** (Weekly).
7. **Health and safety:**
   - A diagnosis
   - Behaviours of concern: *No*
   - Known risk: **Unknown**
8. **Goals and documents:** add a goal. Don't attach a plan.
9. **Review:** tick both consents → **Send referral**.

**Expect**
- A reference (MSR-…) and a private tracking link. **Copy the link.**
- If you close the tab halfway through and reopen `/refer`, your draft comes back.

### A2. Intake review (Jo, window A)
Go to **Referrals and intake** and open Mia's referral.

**Expect** on the referral:
- A *Risk review* tag.
- The completeness check lists the **NDIS plan document**, the **plan manager** and the funding
  periods.
- The region is set to *Brisbane South* (from the postcode).

Then:
1. Click **Take ownership**.
2. Click **Review with AI**. **Expect:** a checklist of suggestions; nothing is sent automatically.
3. Click **Request information**: tick the plan document and plan manager, add a message, then
   **Send request**. **Expect:** the status changes to **Needs Information**.

### A3. The referrer answers (private window)
Open the tracking link.

**Expect:**
- The progress steps.
- "We need a little more information", listing exactly what Jo asked for.
- **No personal details** of Mia on the page.

Write an answer (for example "Plan manager: Example Plan Co, invoices@example.test"), attach any
PDF as *NDIS plan*, then **Send answer**.

**Expect:** Jo's referral is back in **Under Admin Review**, with the document listed. Open the
document: the view is recorded in the audit trail.

### A4. Clinical triage
1. **Jo:** click **Send to clinical triage**.
2. **Jo:** try to record the decision. **Expect:** "Only a Clinical Lead can…". Jo can't decide.
3. **Neil (window B):** the bell shows *Clinical triage*. Open the referral.
4. **Neil:** choose **Accepted** and write notes, but leave the risk fields empty → **Record
   decision**. **Expect:** blocked until the risk plan is recorded.
5. **Neil:** fill in *How the risk will be managed* and the **precaution** (for example "Parent
   present at every visit") → **Record decision**.

**Expect:** the status is **Funding Review**.

### A5. Funding and consent → accept (Jo)
1. **Jo:** before saving the funding review, try **Accept and create service requests**.
   **Expect:** the blockers are listed.
2. Choose Funding **Verified**, Agreement **Signed**, tick consent → **Save funding review**.
3. Click **Accept and create service requests**.

**Expect:**
- An **invite code**, shown once. Copy it.
- **Match therapists** opens Mia's record, with **two service requests** (FCA and OT).
- The red **precautions** banner.
- The plan document under Documents.

---

## Part B: Matching and booking (steps 6–7)

### B1. Credential checks (Jo, on Mia's record)
On the **FCA** service request, look at the ranked therapists.

**Expect:**
- **Ben Holloway** is marked **Unavailable**, "Registration expired", with no times offered.
- Others show "Registration and screening current".

### B2. Automatic allocation is refused when there's a risk
Click **Auto-allocate (low-risk rule)**.

**Expect:** refused: "this patient has a clinical precaution… Choose the therapist yourself."

### B3. Request a therapist
Pick **Daniel Okafor** (or any eligible OT) and a time → **Send request**. Do the same for the
**OT** service. If Daniel has no times for the second one, pick another OT.

**Expect:** both show **Clinician suggested** and a held time.

### B4. The therapist accepts (window C)
Daniel's **My new patients** shows the requests, with the **Precaution** in red. Click **Accept**
on each.

**Expect:**
- Weekly visits are booked for OT.
- The FCA is a single assessment visit.
- Mia's record shows **Active**.

### B5. The patient activates the app (private window)
Open **`/mobile/patient`** → *I have an invite code*. Enter `mia.family@example.test`, the code
and a new password.

**Expect:** the home screen with the next visit, and the care team.

### B6. Bring visits forward (testing only)
In a terminal, in the project folder:

```
node --env-file=.env.local .tmp-check/move-visits.mjs "Mia Testcase"
```

**Expect:** three visits are moved: **yesterday 8 am**, **yesterday 4 pm** and **now**.

---

## Part C: Assessment and plan (steps 8–10)

### C1. Start the assessment (Daniel)
Open Mia's record → **Clinical work** → **FCA** → **Start assessment**.

**Expect:** the *Functional Capacity Assessment (OT/FCA)* template with 14 sections, which
autosaves ("Draft saved").

Fill it in:
- Tick **Consent**.
- For each section, choose **Applicable** (write *Reported* and *Observed*) or **Not applicable**
  (with a reason). For example, *Self-care*: Measure "Dressing 2 of 5 steps, observed".
- **Add activity:** Dressing, Observed, Verbal prompting, Daily.
- Fill in **Findings**, then choose the recommendation **Report only**.

**Expect:** the *Before signing* list shrinks as you go. **Sign assessment** stays disabled until
it's empty.

### C2. Clinical Lead review
1. Before signing, click **AI consistency check**. **Expect:** gaps or contradictions listed;
   nothing is changed.
2. Click **Request Clinical Lead review**. **Expect:** the status is **Awaiting Review** and
   editing is paused.
3. **Neil:** open it from the bell → **Return with comments**.
4. **Daniel:** the assessment is back **In Progress**, with Neil's comment. Click **Sign
   assessment**.

**Expect:**
- Signed and locked.
- The FCA service shows **Completed** ("Assessment only: no plan needed").

### C3. Release the report
On the signed FCA, click **Draft with AI**. Edit the text if needed → **Release to participant**.

**Expect:** Mia's app → **My care** shows the report. **Add an amendment** keeps the original and
records the reason.

### C4. OT assessment and treatment plan
1. On the **OT** service, **Start assessment**. Complete it and choose **Treatment** → sign.
   **Expect:** a draft plan is created.
2. Open **Finish plan**. Add a goal:
   - Description: "Mia will button her school shirt"
   - Measure: "Buttons of 5, observed"
   - Baseline: 1 of 5
   - Target: 5 of 5
3. Fill in the interventions, frequency and a review date → **Approve plan**.
   - Try approving without a review date first. **Expect:** it's blocked.

**Expect:**
- The plan is **Active**.
- Mia's app → **My care** shows the goal ("Started 1 of 5 … Aim 5 of 5").

---

## Part D: Visits (section 11), notes and missed visits

### D1. An in-person visit, recorded afterwards (Daniel)
1. In **Visit history**, open the **yesterday 8 am** visit → **Start visit**.
2. Click **AI briefing**. **Expect:** points, each with its source.
3. Fill in **Who is present**, tick that it's safe, and set the actual check-in time → **Check
   in**.
4. Enter the goal measure ("3 of 5"), the interventions and the response → **Save and check out**.
5. The note sheet opens. Type rough notes → **Draft SOAP note**. **Expect:** an *AI draft* tag, and
   anything missing is listed.
6. Click **Ready to sign**. **Expect:** the visit shows **Sign note**.
7. Open it → **Sign note**.

**Expect:**
- The goal shows *Now 3 of 5* in the plan and in the app.
- The patient sees only the plain summary.
- Jo's **Billing** shows a **Draft** invoice.

### D2. Did not attend
On the **yesterday 4 pm** visit, click **Did not attend**.

**Expect:** a charge line is added to the draft invoice.

### D3. Unsafe arrival and incomplete visits
These are optional, on any later visit:
- Untick *safe* → **End visit early** with a reason. **Expect:** **Aborted (incomplete)**, and Jo
  is asked to rebook.
- **Cancel or change** a future visit and book a new time. **Expect:** the old visit shows
  **Rescheduled**.

---

## Part E: Telehealth (section 12)

### E1. Set it up (Daniel)
1. On the visit moved to **now** (it started a few minutes ago, so it's under **Visit history**), click **Make telehealth** → **Video room**.
2. Try **Create and send link** first. **Expect:** blocked until suitability is recorded.
3. **1. Clinical suitability:** tick it → **Record**.
4. **2. Join link:** **Create and send link** → **Copy**.

### E2. Join as the parent (private window, paste the link)
1. **Your details:**
   - Your name
   - *Parent or guardian*
   - Mia's DOB (try a wrong one first: it's refused)
   - Tick authority → **Continue**
2. **Your choices:** tick Recording and AI transcription → **Save my choices**.
3. **Device check:** **Test my device** (allow the camera) → **Continue** → **Enter the waiting
   room**.

### E3. Run the call (Daniel)
1. **Expect:** the waiting room shows the guest, the four consents and the device result. Click
   **Admit**.
2. Click **Record** without permission. **Expect:** blocked. Tick **I permit recording**, then
   **Record**.
   - **Expect:** a red **Recording** badge for both people.
3. Click **Add sample line** a few times in *AI transcription*.
4. Add an **Interpreter** under *Participants*; try **Share screen**, **Pause** and **Resume**.
5. Click **End call**. **Expect:** the visit is Completed with its minutes, and the note sheet
   opens. Sign the note.
6. Open the join link again. **Expect:** "This video visit has finished".

### E4. Recordings
1. **Daniel → Recordings:** the recording shows **Processing**, then **Available** after a
   refresh.
2. **Jo → Recordings:** **Expect:** not available (operations staff can't open recordings).
3. **Neil → Recordings:**
   - Enter a purpose → **Review recording**. **Expect:** *DEMO ONLY* playback, download disabled,
     and the access log updated.
   - **Restrict access**. Daniel's review is now refused.
   - **Delete per policy** with a reason.

### E5. Join from the patient app
In Mia's app → **Visits**:
- **Confirm I'll be there**. **Expect:** *You confirmed*.
- On a telehealth visit, **Join video visit**. This works once Daniel has recorded suitability
  for that visit.

---

## Part F: Billing (step 11, Jo as Finance)

Go to **Billing** and open the draft invoice.

**Expect:**
- It's addressed to the **plan manager**, the payer for a Plan Managed NDIS plan.
- Lines for the attended visits (minutes × hourly rate) and the *Did not attend* charge.
- **No clinical notes.**

1. **Send for review** → **Approve** → **Issue to payer**. **Expect:** blocked, "Support item
   numbers to confirm".
2. **Back to draft**. Enter an item number on each line → **Save** → review → approve → **Issue**.
3. **Record payment** for part of the amount (*Partially Paid*), then the rest (*Paid*).
4. Optional: on another invoice, **Mark disputed** → **Add adjustment** → **Reissue**.

**Expect:** Mia's app → **My care** → **Invoices** shows the issued invoice.

---

## Part G: Review and discharge (step 12)

1. **Daniel → OT plan → Start review.** **Expect:** the status is **Under Review**.
2. Set the goal to **Achieved**, choose Decision **Discharge**, add notes → **Record review**.
   **Expect:** the plan is **Completed**.
   - Optional: **Draft progress summary** (AI), before the review.
3. On Mia's record, click **Discharge**. Fill in:
   - Reason
   - **Outcomes** (required)
   - Risks, advice and handover
   - Tick **sign**

   → **Sign and discharge**.

**Expect:**
- Future visits are cancelled without charge.
- The services show **Completed**.
- Jo's referral shows **Closed**.
- Mia's app → **My care** shows **Advice from your therapist**.

---

## Privacy checks (E2E-15, E2E-18)

| Try | Expect |
|---|---|
| Jo opens an assessment link (copy it from Daniel's address bar) | "Not found". Jo sees statuses only on the patient record. |
| Neil opens the same link | Read-only. |
| The patient app | Only plain summaries, released reports, approved goals and invoices. No SOAP notes, risks or recordings. |
| Daniel opens `/care/billing` | Redirected; finance only. |
| The patient record → **Activity**, and the referral → **Audit trail** | Every decision, view of a document, signature and recording access, each with who and when. |

## If something looks wrong

- Note the step number, take a screenshot and copy any red message.
- **Live** in the header should be green. If it says *Reconnecting*, refresh the page.
- The AI buttons need an AI key. Without one they say "AI isn't available"; everything else still
  works.
