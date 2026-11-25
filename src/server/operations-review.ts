import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { AiError, rethrowDisabled } from "@/lib/ai/types";
import {
  findingDecisions,
  type Confidence,
  type FindingCategory,
  type FindingDto,
  type FindingSeverity,
  type ReviewDto,
} from "@/lib/live/operations";
import { completenessGaps, needsRiskReview } from "@/lib/live/referral";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit } from "./live";
import { insertTask, opsCan, opsChanged, opsSettings, queueMessage } from "./operations";
import { regionForPostcode } from "./referrals";
import type { OpsFindingDoc, OpsReviewDoc, ReferralDoc, UserDoc } from "./models";

/**
 * Section 8: the deterministic validator runs first; AI then extracts and cross-checks with
 * evidence and a confidence for each item. A person decides every finding, and the submitted
 * referral is never overwritten: accepted corrections are stored beside it.
 */

const nameOf = (r: ReferralDoc) => `${r.data.participant.firstName} ${r.data.participant.lastName}`;

/** Reads the text of a simple, uncompressed PDF (as our referral letters are). Others give "". */
export function pdfText(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  if (!raw.startsWith("%PDF")) return "";
  const parts = [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) =>
    (m[1] ?? "").replace(/\\([()\\])/g, "$1"),
  );
  return parts.join("\n").slice(0, 4000);
}

/** A one-page PDF with the given lines, for seeded referral letters. */
export function makePdf(lines: string[]) {
  const esc = (t: string) => t.replace(/([()\\])/g, "\\$1");
  const content = `BT /F1 11 Tf 56 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

const finding = (f: Omit<OpsFindingDoc, "id" | "resolution" | "decision">): OpsFindingDoc => ({
  ...f,
  id: randomUUID(),
  resolution: "Open",
  decision: null,
});

/** Rules, not AI (OP-012, OP-013): every missing item names its exact form field. */
function validate(r: ReferralDoc, docs: { kind: string; name: string }[]): OpsFindingDoc[] {
  const out: OpsFindingDoc[] = completenessGaps(r.data, docs).map((g) =>
    finding({
      category: "Missing",
      severity: "Action Needed",
      confidence: null,
      field: g.field,
      label: g.label,
      detail: "Required for intake but not on the submitted referral.",
      source: g.field.startsWith("document:") ? "Attachments" : `Form field ${g.field}`,
      evidence: g.field.startsWith("document:")
        ? `No ${g.field.slice(9)} attached`
        : "Left blank on the form",
      original: "",
      suggested: "",
      origin: "Validator",
    }),
  );
  const today = new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
  const f = r.data.funding;
  if (f.source === "NDIS" && f.planEndDate && f.planEndDate < today) {
    out.push(
      finding({
        category: "Inconsistent",
        severity: "Action Needed",
        confidence: null,
        field: "funding.planEndDate",
        label: "Plan end date has passed",
        detail: "The plan may have been renewed: ask for the current plan.",
        source: "Form field funding.planEndDate",
        evidence: f.planEndDate,
        original: f.planEndDate,
        suggested: "",
        origin: "Validator",
      }),
    );
  }
  if (f.source === "NDIS" && f.ndisNumber && !/^\d{9}$/.test(f.ndisNumber.replace(/\s/g, ""))) {
    out.push(
      finding({
        category: "Inconsistent",
        severity: "Action Needed",
        confidence: null,
        field: "funding.ndisNumber",
        label: "NDIS number format",
        detail: "NDIS numbers have 9 digits.",
        source: "Form field funding.ndisNumber",
        evidence: f.ndisNumber,
        original: f.ndisNumber,
        suggested: "",
        origin: "Validator",
      }),
    );
  }
  const pc = r.data.participant.address.postcode;
  if (pc && !regionForPostcode(pc) && r.data.location.type !== "Telehealth") {
    out.push(
      finding({
        category: "Inconsistent",
        severity: "Action Needed",
        confidence: null,
        field: "participant.address.postcode",
        label: "Postcode outside the service area",
        detail:
          "Medisense visits Brisbane North and South. Confirm the address or offer telehealth.",
        source: "Form field participant.address.postcode",
        evidence: pc,
        original: pc,
        suggested: "",
        origin: "Validator",
      }),
    );
  }
  if (needsRiskReview(r.data)) {
    out.push(
      finding({
        category: "Risk Flag",
        severity: "Clinical Review Required",
        confidence: null,
        field: "clinical.knownRisk",
        label: "Reported risk or behaviours for clinical review",
        detail: "Routed to a Clinical Lead. Neither AI nor intake can clear it.",
        source: "Form fields clinical.knownRisk, clinical.behaviours",
        evidence: `Known risk: ${r.data.clinical.knownRisk}; behaviours of concern: ${r.data.clinical.behaviours}`,
        original: r.data.clinical.knownRisk,
        suggested: "",
        origin: "Validator",
      }),
    );
  }
  for (const d of r.duplicates) {
    out.push(
      finding({
        category: "Duplicate Candidate",
        severity: "Action Needed",
        confidence: null,
        field: "participant",
        label: `Possible duplicate: ${d.name}`,
        detail: `${d.why}. Records are never merged automatically.`,
        source: `Existing ${d.kind}`,
        evidence: d.why,
        original: nameOf(r),
        suggested: "",
        origin: "Validator",
      }),
    );
  }
  return out;
}

const aiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "field",
          "label",
          "detail",
          "source",
          "evidence",
          "original",
          "suggested",
          "confidence",
        ],
        properties: {
          category: {
            type: "string",
            enum: ["Inconsistent", "Document Extraction", "Recommendation"],
          },
          field: { type: "string" },
          label: { type: "string" },
          detail: { type: "string" },
          source: { type: "string" },
          evidence: { type: "string" },
          original: { type: "string" },
          suggested: { type: "string" },
          confidence: { type: "string", enum: ["Low", "Medium", "High"] },
        },
      },
    },
  },
} as const;

type AiFinding = {
  category: FindingCategory;
  field: string;
  label: string;
  detail: string;
  source: string;
  evidence: string;
  original: string;
  suggested: string;
  confidence: Confidence;
};

async function loadReview(referralId: ObjectId) {
  const { referrals, opsReviews, documents } = await collections();
  const r = await referrals.findOne({ _id: referralId });
  if (!r) throw new UserFacingError("Referral not found.", 404);
  const docs = await documents.find({ referralId, status: { $ne: "Superseded" } }).toArray();
  let review = await opsReviews.findOne({ referralId });
  if (!review) {
    review = {
      _id: new ObjectId(),
      referralId,
      snapshot: r.data,
      snapshotAt: new Date(),
      validatorRan: new Date(),
      aiRan: null,
      findings: validate(r, docs),
      verified: [],
    };
    await opsReviews.insertOne(review).catch(() => undefined);
    review = (await opsReviews.findOne({ referralId })) ?? review;
  }
  return { r, review, docs };
}

/** Re-runs the validator against the locked snapshot. Decided findings are kept. */
export async function runValidator(u: UserDoc, referralId: ObjectId) {
  const { r, review, docs } = await loadReview(referralId);
  const fresh = validate({ ...r, data: review.snapshot }, docs);
  const kept = review.findings.filter((f) => f.origin === "AI" || f.resolution !== "Open");
  const merged = [
    ...kept,
    ...fresh.filter(
      (n) =>
        !kept.some(
          (k) => k.origin === "Validator" && k.field === n.field && k.category === n.category,
        ),
    ),
  ];
  const { opsReviews } = await collections();
  await opsReviews.updateOne(
    { _id: review._id },
    { $set: { findings: merged, validatorRan: new Date() } },
  );
  await audit(u, `Operations: validator re-run on ${r.reference}`, r.clientId);
  return { ok: true };
}

export async function runAiReview(u: UserDoc, referralId: ObjectId) {
  if (u.role !== "admin")
    throw new UserFacingError("Only admin staff run the referral review.", 409);
  if (!(await opsSettings()).aiReviewEnabled)
    throw new UserFacingError("AI referral review is switched off in Settings.", 409);
  const { r, review, docs } = await loadReview(referralId);
  if (!review.validatorRan) throw new UserFacingError("Run the completeness check first.", 409);
  const s = review.snapshot;
  const documentsForAi = docs.map((d) => ({
    name: d.name,
    kind: d.kind,
    text: d.mime === "application/pdf" ? pdfText(Buffer.from(d.data.buffer)) : "",
  }));
  let parsed: { summary: string; findings: AiFinding[] };
  try {
    const out = await generateJson("ops-referral-review", {
      system:
        'You review an allied health referral for an intake administrator. Compare the form fields with the text of each attached document. Report: Inconsistent (a form value disagrees with a document, or two fields disagree), Document Extraction (a fact in a document that is missing from the form, with the value to add), Recommendation (an administrative next step). For every item give the exact form field path, the source ("Form field <path>" or "<document name>, page 1"), a short verbatim evidence quote, the original form value, a suggested value if any, and your confidence. Never diagnose, never rate clinical risk or severity, never decide consent, eligibility or acceptance. Don\'t repeat items already found by the completeness check. If a document has no readable text, don\'t invent its contents.',
      user: JSON.stringify({
        today: new Date().toISOString().slice(0, 10),
        form: {
          participant: s.participant,
          funding: s.funding,
          signatory: s.signatory,
          booking: s.booking,
          location: s.location,
          supports: s.supports,
          goals: s.goals,
          comments: s.comments,
          supportCoordinator: s.supportCoordinator,
        },
        alreadyFound: review.findings.filter((f) => f.origin === "Validator").map((f) => f.label),
        documents: documentsForAi,
      }),
      schema: aiSchema,
      schemaName: "ops_referral_review",
      maxTokens: 1400,
    });
    parsed = JSON.parse(out.text) as typeof parsed;
  } catch (error) {
    rethrowDisabled(error);
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
  const severity: FindingSeverity = "Informational";
  const fresh = parsed.findings.slice(0, 12).map((f) => {
    // Without evidence or a source, it's an unsupported suggestion: shown, never acted on (section 14).
    const unsupported = !f.evidence.trim() || !f.source.trim();
    return finding({
      category: f.category,
      severity: f.category === "Recommendation" ? severity : "Action Needed",
      confidence: unsupported ? "Low" : f.confidence,
      field: f.field,
      label: f.label,
      detail: unsupported ? `${f.detail} (Unsupported: no source evidence given.)` : f.detail,
      source: f.source || "No source given",
      evidence: f.evidence,
      original: f.original,
      suggested: unsupported ? "" : f.suggested,
      origin: "AI",
    });
  });
  if (parsed.summary) {
    fresh.unshift(
      finding({
        category: "Recommendation",
        severity: "Informational",
        confidence: "Medium",
        field: "summary",
        label: "Intake summary",
        detail: parsed.summary,
        source: "Whole referral",
        evidence: "",
        original: "",
        suggested: "",
        origin: "AI",
      }),
    );
  }
  const { opsReviews } = await collections();
  const kept = review.findings.filter((f) => f.origin === "Validator" || f.resolution !== "Open");
  await opsReviews.updateOne(
    { _id: review._id },
    { $set: { findings: [...kept, ...fresh], aiRan: new Date() } },
  );
  await audit(
    u,
    `Operations: AI referral review on ${r.reference} (${fresh.length} suggestions, needs review)`,
    r.clientId,
  );
  await opsChanged();
  return { count: fresh.length };
}

export const findingActionSchema = z.object({
  findingId: z.string().max(60),
  decision: z.enum(findingDecisions).or(z.literal("Defer")),
  value: z.string().trim().max(500).default(""),
  note: z.string().trim().max(1000).default(""),
});

/** OP-015, OP-016: a rejection leaves the field alone; an acceptance stores verifier and source. */
export async function decideFinding(
  u: UserDoc,
  referralId: ObjectId,
  input: z.infer<typeof findingActionSchema>,
) {
  const can = opsCan(u);
  if (u.role !== "admin") throw new UserFacingError("Only admin staff decide findings.", 409);
  const { review, r } = await loadReview(referralId);
  const f = review.findings.find((x) => x.id === input.findingId);
  if (!f) throw new UserFacingError("Finding not found.", 404);
  if (f.resolution !== "Open" && f.resolution !== "Deferred")
    throw new UserFacingError("This finding is already decided.", 409);
  if (f.category === "Risk Flag" && input.decision !== "Escalate" && !can.clinical) {
    throw new UserFacingError(
      "A risk flag can only be routed to a Clinical Lead. Choose Route to Clinical Lead.",
      409,
    );
  }
  if (
    f.category === "Risk Flag" &&
    (input.decision === "Accept" || input.decision === "Reject") &&
    can.clinical &&
    input.note.length < 10
  ) {
    throw new UserFacingError("Record the clinical rationale.");
  }
  if (input.decision === "Defer" && input.note.length < 3)
    throw new UserFacingError("Give the reason for deferring.");
  if (input.decision === "Correct" && !input.value)
    throw new UserFacingError("Enter the corrected value.");
  if (f.category === "Duplicate Candidate" && input.decision === "Accept") {
    throw new UserFacingError(
      "Duplicates are never merged here. Record the decision on the referral itself.",
      409,
    );
  }
  const now = new Date();
  const value =
    input.decision === "Accept" ? f.suggested : input.decision === "Correct" ? input.value : "";
  const resolution =
    input.decision === "Reject"
      ? "Rejected"
      : input.decision === "Defer"
        ? "Deferred"
        : input.decision === "Request Clarification" || input.decision === "Escalate"
          ? "Resolved"
          : "Resolved";
  const findings = review.findings.map((x) =>
    x.id === f.id
      ? {
          ...x,
          resolution,
          decision: {
            decision:
              input.decision === "Defer" ? ("Request Clarification" as const) : input.decision,
            value,
            note: input.decision === "Defer" ? `Deferred: ${input.note}` : input.note,
            by: u.name,
            at: now,
          },
        }
      : x,
  ) as OpsFindingDoc[];
  const verified = [...review.verified];
  if ((input.decision === "Accept" && f.suggested) || input.decision === "Correct") {
    verified.push({
      field: f.field,
      value,
      source: `${f.source}${f.evidence ? `: "${f.evidence}"` : ""}`,
      by: u.name,
      at: now,
    });
  }
  const { opsReviews } = await collections();
  await opsReviews.updateOne({ _id: review._id }, { $set: { findings, verified } });
  if (input.decision === "Escalate") {
    await insertTask(u, {
      title: `Clinical review requested from intake: ${r.reference}`,
      category: "Clinical Review",
      status: "New",
      priority: "High",
      urgentReason: "",
      team: "Clinical",
      assigneeId: null,
      assigneeName: null,
      related: {
        kind: "Referral",
        ref: r.reference,
        label: nameOf(r),
        href: `/care/referrals/${r._id.toHexString()}`,
      },
      clientId: r.clientId,
      referralId: r._id,
      appointmentId: null,
      participant: nameOf(r),
      service: r.data.supports[0]?.support ?? null,
      discipline: null,
      locationType: r.data.location.type,
      dueAt: new Date(Date.now() + 4 * 3_600_000),
      sla: "Clinical Escalation",
      visibility: "Clinical Restricted",
      source: "Manual",
      ruleCode: null,
      ruleVersion: null,
      idemKey: `review-escalate:${f.id}`,
      restrictedNote: `${f.label}: ${f.evidence}`,
      recordingHref: null,
      suggestion: false,
      scenario: null,
      checklist: [{ label: "Review the finding and record the clinical decision" }],
      note: input.note,
    });
  }
  if (input.decision === "Request Clarification") {
    await queueMessage({
      key: `review-clarify:${f.id}`,
      template: "TPL-MISSING-INFO",
      recipientType: "Patient",
      clientId: null,
      referralId: r._id,
      vars: { referral_number: r.reference },
      related: { label: `Referral ${r.reference}`, href: `/care/referrals/${r._id.toHexString()}` },
      taskId: null,
      by: u.name,
      mode: "Suggest Only",
    });
  }
  await audit(
    u,
    `Operations: ${r.reference} finding "${f.label}" ${input.decision}${value ? ` → ${value}` : ""} (submitted value kept)`,
    r.clientId,
  );
  await opsChanged();
  return { ok: true };
}

export function reviewDto(
  review: OpsReviewDoc,
  r: ReferralDoc,
  docs: { name: string; kind: string }[],
  viewer: UserDoc,
): ReviewDto {
  const can = opsCan(viewer);
  const restricted = needsRiskReview(r.data);
  const dup = r.duplicateDecision;
  const findings: FindingDto[] = review.findings
    .map((x) =>
      x.category === "Duplicate Candidate" && dup && x.resolution === "Open"
        ? {
            ...x,
            resolution: "Resolved" as const,
            decision: {
              decision: "Accept" as const,
              value: dup.clientId ? "Linked to the existing patient" : "Confirmed as a new patient",
              note: "Decided on the referral",
              by: dup.byName,
              at: dup.at,
            },
          }
        : x,
    )
    .map((f) => ({
      ...f,
      evidence:
        f.category === "Risk Flag" && !can.clinical
          ? "Restricted: visible to the Clinical Lead"
          : f.evidence,
      decision: f.decision ? { ...f.decision, at: f.decision.at.toISOString() } : null,
    }));
  const open = findings.filter((f) => f.resolution === "Open" && f.severity !== "Informational");
  const blockers = [
    ...open.filter((f) => f.category === "Missing").map((f) => `Missing: ${f.label}`),
    ...open.filter((f) => f.category === "Inconsistent").map((f) => `Check: ${f.label}`),
    ...(r.duplicates.length && !r.duplicateDecision
      ? ["Decide the possible duplicate on the referral"]
      : []),
    ...(restricted && !r.triage ? ["Clinical Lead review of the reported risk"] : []),
  ];
  return {
    referralId: r._id.toHexString(),
    reference: r.reference,
    participant: nameOf(r),
    status: r.status,
    supports: r.data.supports.map((s) => s.support),
    submittedAt: r.createdAt.toISOString(),
    snapshotAt: review.snapshotAt.toISOString(),
    validatorRan: review.validatorRan?.toISOString() ?? null,
    aiRan: review.aiRan?.toISOString() ?? null,
    findings,
    restricted,
    ready: blockers.length === 0,
    blockers,
    href: `/care/referrals/${r._id.toHexString()}`,
    documents: docs.map((d) => ({ name: d.name, kind: d.kind })),
  };
}

/** Every open referral gets a locked snapshot and a validator pass before anything else. */
export async function reviewsFor(viewer: UserDoc) {
  const { referrals, documents, opsReviews } = await collections();
  const open = await referrals
    .find({
      status: {
        $in: [
          "Submitted",
          "Under Admin Review",
          "Needs Information",
          "Clinical Triage",
          "Funding Review",
        ],
      },
    })
    .sort({ createdAt: -1 })
    .limit(40)
    .toArray();
  // Reviews and documents for every open referral in two queries, not two or three per referral.
  const ids = open.map((r) => r._id);
  const [reviews, docs] = await Promise.all([
    opsReviews.find({ referralId: { $in: ids } }).toArray(),
    documents
      .find(
        { referralId: { $in: ids }, status: { $ne: "Superseded" } },
        { projection: { name: 1, kind: 1, referralId: 1 } },
      )
      .toArray(),
  ]);
  return Promise.all(
    open.map(async (r) => {
      const review =
        reviews.find((x) => x.referralId.equals(r._id)) ?? (await loadReview(r._id)).review;
      const mine = docs.filter((d) => d.referralId?.equals(r._id));
      return reviewDto(review, r, mine, viewer);
    }),
  );
}
