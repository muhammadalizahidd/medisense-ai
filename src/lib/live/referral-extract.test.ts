import { describe, expect, it } from "vitest";
import { referralFromExtraction } from "./referral-extract";

describe("AI referral reading", () => {
  it("fills the live form from what AI read", () => {
    const { form, filled } = referralFromExtraction({
      submitterRole: "Support coordinator",
      submitterName: "Priya Natarajan",
      firstName: "Lucas",
      lastName: "Bennett",
      dateOfBirth: "2015-03-14",
      street: "27 Wattle Street",
      suburb: "Chermside",
      state: "QLD",
      postcode: "4032",
      ndisNumber: "431 556 782",
      planType: "Plan Managed",
      supports: [
        { support: "Functional Capacity Assessment", frequency: "Assessment" },
        { support: "Occupational Therapy", frequency: "Weekly" },
      ],
    });
    expect(form.participant.firstName).toBe("Lucas");
    expect(form.participant.dateOfBirth).toBe("2015-03-14");
    expect(form.funding.ndisNumber).toBe("431556782");
    expect(form.supports.map((s) => s.support)).toEqual([
      "Functional Capacity Assessment",
      "Occupational Therapy",
    ]);
    expect(filled).toBeGreaterThan(8);
  });

  it("leaves anything that doesn't fit blank instead of guessing", () => {
    const { form } = referralFromExtraction({
      dateOfBirth: "14/03/2015",
      postcode: "40",
      submitterEmail: "not an email",
      planType: "Mostly managed",
      supports: [{ support: "Massage", frequency: "Weekly" }],
    });
    expect(form.participant.dateOfBirth).toBe("");
    expect(form.participant.address.postcode).toBe("");
    expect(form.submitter.email).toBe("");
    expect(form.funding.planType).toBe("");
    expect(form.supports).toEqual([]);
  });

  it("never ticks consent or the referrer's authority", () => {
    const { form } = referralFromExtraction({ firstName: "Lucas" });
    expect(form.consent.privacy).toBe(false);
    expect(form.consent.shareWithClinicians).toBe(false);
    expect(form.submitter.authorityConfirmed).toBe(false);
  });
});
