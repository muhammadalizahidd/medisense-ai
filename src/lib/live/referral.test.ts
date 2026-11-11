import { describe, expect, it } from "vitest";
import {
  canMove,
  completenessGaps,
  emptyReferral,
  frequencyFor,
  isFinal,
  needsRiskReview,
  referralSchema,
  sampleReferral,
  type ReferralInput,
} from "./referral";

/** A complete, fictional NDIS referral for one occupational therapy service. */
function complete(): ReferralInput {
  const r = emptyReferral();
  return {
    ...r,
    submitter: { ...r.submitter, name: "Pat Example", authorityConfirmed: true },
    participant: {
      firstName: "Sam",
      lastName: "Example",
      dateOfBirth: "2015-04-02",
      email: "sam.example@example.test",
      phone: "",
      address: { street: "1 Test Street", suburb: "Carindale", state: "QLD", postcode: "4152" },
    },
    funding: {
      ...r.funding,
      ndisNumber: "430000000",
      planEndDate: "2027-06-30",
      planType: "Self-Managed",
      fundingPeriods: "No",
    },
    signatory: {
      role: "Parent or guardian",
      name: "Pat Example",
      email: "",
      phone: "0400 000 000",
    },
    booking: {
      role: "Parent or guardian",
      name: "Pat Example",
      email: "",
      phone: "0400 000 000",
      method: "Phone",
      preferredTime: "",
    },
    clinical: { ...r.clinical, diagnosis: "Developmental delay" },
    supports: [
      {
        support: "Occupational Therapy",
        frequency: "Weekly",
        frequencyOther: "",
        nursingType: "",
        details: "",
      },
    ],
    goals: "Dress independently",
    consent: { privacy: true, shareWithClinicians: true },
  };
}

describe("referral status machine", () => {
  it("follows the lifecycle from intake to acceptance", () => {
    expect(canMove("Under Admin Review", "Clinical Triage")).toBe(true);
    expect(canMove("Clinical Triage", "Funding Review")).toBe(true);
    expect(canMove("Funding Review", "Accepted")).toBe(true);
  });

  it("refuses skipping clinical triage or funding", () => {
    expect(canMove("Under Admin Review", "Accepted")).toBe(false);
    expect(canMove("Clinical Triage", "Accepted")).toBe(false);
  });

  it("returns an answered request to the stage that asked", () => {
    expect(canMove("Needs Information", "Clinical Triage")).toBe(true);
    expect(canMove("Needs Information", "Funding Review")).toBe(true);
  });

  it("treats declined and withdrawn as final", () => {
    expect(isFinal("Declined")).toBe(true);
    expect(isFinal("Withdrawn")).toBe(true);
    expect(isFinal("Accepted")).toBe(false);
  });
});

describe("referral form rules", () => {
  it("accepts a complete referral", () => {
    expect(referralSchema.safeParse(complete()).success).toBe(true);
  });

  it("needs the NDIS number, plan end date and plan type for NDIS", () => {
    const r = complete();
    r.funding.ndisNumber = "";
    r.funding.planType = "";
    const result = referralSchema.safeParse(r);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("funding.ndisNumber");
    expect(paths).toContain("funding.planType");
  });

  it("needs details when a known risk is Yes", () => {
    const r = complete();
    r.clinical.knownRisk = "Yes";
    const result = referralSchema.safeParse(r);
    expect(result.success).toBe(false);
  });

  it("needs a nursing type for nursing", () => {
    const r = complete();
    r.supports = [
      { support: "Nursing", frequency: "Weekly", frequencyOther: "", nursingType: "", details: "" },
    ];
    expect(referralSchema.safeParse(r).success).toBe(false);
  });

  it("needs an email for the participant or the booking contact", () => {
    const r = complete();
    r.participant.email = "";
    expect(referralSchema.safeParse(r).success).toBe(false);
  });
});

describe("completeness check", () => {
  it("flags the missing NDIS plan document", () => {
    const gaps = completenessGaps(complete(), []);
    expect(gaps.map((g) => g.field)).toEqual(["document:NDIS plan"]);
  });

  it("is satisfied once the plan is attached", () => {
    expect(completenessGaps(complete(), [{ kind: "NDIS plan" }])).toEqual([]);
  });

  it("asks for the plan manager when plan managed", () => {
    const r = complete();
    r.funding.planType = "Plan Managed";
    const fields = completenessGaps(r, [{ kind: "NDIS plan" }]).map((g) => g.field);
    expect(fields).toContain("funding.planManagerCompany");
    expect(fields).toContain("funding.planManagerEmail");
  });
});

describe("risk and frequency", () => {
  it("sends Unknown risk to clinical review: no answer is not proof of no risk", () => {
    const r = complete();
    r.clinical.knownRisk = "Unknown";
    expect(needsRiskReview(r)).toBe(true);
    expect(needsRiskReview(complete())).toBe(false);
  });

  it("books assessment-only supports as one assessment", () => {
    expect(
      frequencyFor({
        support: "Functional Capacity Assessment",
        frequency: "Weekly",
        frequencyOther: "",
        nursingType: "",
        details: "",
      }),
    ).toBe("Assessment");
  });
});

describe("sample referral", () => {
  it("is always a complete, valid referral", () => {
    for (let i = 0; i < 20; i++)
      expect(referralSchema.safeParse(sampleReferral()).success).toBe(true);
  });
});
