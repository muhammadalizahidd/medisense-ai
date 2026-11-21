import { describe, expect, it } from "vitest";
import {
  agreementInputSchema,
  lineEstimate,
  localRemaining,
  maskNdis,
  occurrences,
  overlapping,
  payerInputSchema,
  planInputSchema,
} from "./funding";

describe("Module 06 calculations", () => {
  it("counts occurrences over the agreement period", () => {
    expect(occurrences("Once", "2026-07-01", "2027-06-30")).toBe(1);
    expect(occurrences("As agreed", "2026-07-01", "2027-06-30")).toBe(1);
    expect(occurrences("Weekly", "2026-07-01", "2026-07-28")).toBe(4);
    expect(occurrences("Fortnightly", "2026-07-01", "2026-12-31")).toBe(13);
    expect(occurrences("Monthly", "2026-07-01", "2027-06-30")).toBe(11);
  });

  it("estimates a line as quantity × unit price × occurrences, to the cent (AT-14)", () => {
    expect(
      lineEstimate(
        { quantity: 6, unitPrice: 193.99, frequency: "Once" },
        "2026-07-01",
        "2026-12-31",
      ),
    ).toBe(1163.94);
    // Travel is its own line, never folded into the service line.
    expect(
      lineEstimate(
        { quantity: 20, unitPrice: 0.99, frequency: "Weekly" },
        "2026-07-01",
        "2026-07-28",
      ),
    ).toBe(79.2);
  });

  it("only gives a local remaining figure after a verified snapshot (AT-17, AT-26)", () => {
    expect(localRemaining(null, 500)).toBeNull();
    expect(localRemaining(9000, 6460.24)).toBe(2539.76);
    expect(localRemaining(1000, 1200.5)).toBe(-200.5);
  });

  it("flags overlapping funding periods (AT-06)", () => {
    expect(
      overlapping([
        { start: "2026-07-01", end: "2026-12-31" },
        { start: "2027-01-01", end: "2027-06-30" },
      ]),
    ).toBe(false);
    expect(
      overlapping([
        { start: "2027-01-01", end: "2027-06-30" },
        { start: "2026-07-01", end: "2027-01-15" },
      ]),
    ).toBe(true);
  });

  it("masks NDIS numbers when displayed", () => {
    expect(maskNdis("430999111")).toBe("•••••9111");
  });
});

describe("Module 06 validation", () => {
  const plan = {
    ndisNumber: "430999111",
    start: "2026-07-01",
    end: "2027-06-30",
    management: "Plan Managed",
    fundingPeriods: "Yes",
    periods: [{ start: "2026-07-01", end: "2026-12-31", note: "" }],
    geography: "National",
    source: "NDIA document",
    reason: "",
  };

  it("rejects a plan that ends before it starts, and non-digit NDIS numbers", () => {
    expect(planInputSchema.safeParse(plan).success).toBe(true);
    expect(planInputSchema.safeParse({ ...plan, end: "2026-06-01" }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...plan, ndisNumber: "43A99" }).success).toBe(false);
    expect(
      planInputSchema.safeParse({
        ...plan,
        periods: [{ start: "2026-12-31", end: "2026-07-01", note: "" }],
      }).success,
    ).toBe(false);
  });

  const payer = {
    kind: "Plan manager",
    name: "Sample Plan Partners",
    contactName: "",
    email: "",
    phone: "",
    deliveryMethod: "Email",
    clientId: "",
    authority: "",
    abn: "",
    billingNotes: "",
    effectiveFrom: "",
  };

  it("needs a plan manager email, and an authority for self-managed payers (AT-03, AT-04, AT-36)", () => {
    expect(payerInputSchema.safeParse(payer).success).toBe(false);
    expect(payerInputSchema.safeParse({ ...payer, email: "bad" }).success).toBe(false);
    expect(payerInputSchema.safeParse({ ...payer, email: "invoices@example.test" }).success).toBe(
      true,
    );
    expect(
      payerInputSchema.safeParse({ ...payer, kind: "Self-managed payer", email: "" }).success,
    ).toBe(false);
    expect(
      payerInputSchema.safeParse({ ...payer, kind: "Self-managed payer", authority: "Participant" })
        .success,
    ).toBe(true);
  });

  it("refuses negative quantities and prices on agreement lines (section 12)", () => {
    const agreement = {
      start: "2026-07-01",
      end: "2026-12-31",
      planId: "",
      signatory: {
        contactId: "",
        name: "Jordan Sample",
        email: "",
        authority: "Participant (self)",
      },
      lines: [
        {
          needId: "n1",
          support: "Occupational Therapy",
          kind: "Service",
          scope: "",
          deliverySetting: "Home",
          unit: "Hour",
          quantity: 1,
          frequency: "Weekly",
          unitPrice: 193.99,
          priceItemId: "",
          budgetId: "",
        },
      ],
      cancellation: "Tell us two business days before a visit if you can't attend.",
      rights: [],
      communication: [],
      communicationNote: "",
      sharing: "Secure link",
      reason: "",
    };
    expect(agreementInputSchema.safeParse(agreement).success).toBe(true);
    expect(
      agreementInputSchema.safeParse({
        ...agreement,
        lines: [{ ...agreement.lines[0], unitPrice: -1 }],
      }).success,
    ).toBe(false);
    expect(agreementInputSchema.safeParse({ ...agreement, end: "2026-06-01" }).success).toBe(false);
  });
});
