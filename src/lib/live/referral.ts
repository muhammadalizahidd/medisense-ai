import { z } from "zod";
import {
  australianStates,
  contactMethods,
  contactRoles,
  frequencies,
  fundingStreams,
  isInPerson,
  nursingTypes,
  planTypes,
  serviceLocations,
  submitterRoles,
  supportInfo,
  supports,
  yesNoUnknown,
} from "./catalogue";

/**
 * The participant referral (functional requirements, section 5) and its status machine
 * (section 3.1). Shared by the public form, the intake screens and the server.
 */

export const referralStatuses = [
  "Submitted",
  "Needs Information",
  "Under Admin Review",
  "Clinical Triage",
  "Funding Review",
  "Waitlisted",
  "Accepted",
  "Declined",
  "Withdrawn",
  "Closed",
] as const;
export type ReferralStatus = (typeof referralStatuses)[number];

/** Which status can follow which. Anything else is refused by the server. */
export const referralMoves: Record<ReferralStatus, readonly ReferralStatus[]> = {
  Submitted: ["Under Admin Review", "Needs Information", "Withdrawn"],
  "Needs Information": [
    "Under Admin Review",
    "Clinical Triage",
    "Funding Review",
    "Withdrawn",
    "Declined",
  ],
  "Under Admin Review": [
    "Needs Information",
    "Clinical Triage",
    "Waitlisted",
    "Declined",
    "Withdrawn",
  ],
  "Clinical Triage": ["Funding Review", "Needs Information", "Waitlisted", "Declined", "Withdrawn"],
  "Funding Review": ["Accepted", "Needs Information", "Waitlisted", "Declined", "Withdrawn"],
  Waitlisted: ["Under Admin Review", "Clinical Triage", "Funding Review", "Declined", "Withdrawn"],
  Accepted: ["Closed"],
  Declined: [],
  Withdrawn: [],
  Closed: [],
};

export const canMove = (from: ReferralStatus, to: ReferralStatus) =>
  referralMoves[from].includes(to);

/** Statuses where the referral is finished and nothing more can happen to it. */
export const isFinal = (status: ReferralStatus) => referralMoves[status].length === 0;

/** Plain words for the person who sent the referral, on the tracking page. */
export const statusForSubmitter: Record<ReferralStatus, string> = {
  Submitted: "Received. Our intake team will review it shortly.",
  "Needs Information": "We need a little more information from you. See below.",
  "Under Admin Review": "Our intake team is reviewing the referral.",
  "Clinical Triage": "A senior clinician is reviewing the referral.",
  "Funding Review": "We're confirming funding and the service agreement.",
  Waitlisted: "The referral is on our waitlist. We'll contact you when a place opens.",
  Accepted: "Accepted. We're matching a therapist and will contact the booking contact.",
  Declined: "We're unable to accept this referral. Our team will contact you to explain.",
  Withdrawn: "This referral was withdrawn.",
  Closed: "This referral is closed.",
};

const text = (max = 200) => z.string().trim().max(max);
const required = (label: string, max = 200) => z.string().trim().min(1, `Enter ${label}`).max(max);
const optionalEmail = z
  .union([z.literal(""), z.email("Check the email address")])
  .transform((v) => v.toLowerCase());
const phone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || /^[+()\d\s-]{8,}$/.test(v), "Check the phone number");
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Check the date")]);

const address = z.object({
  street: text(160),
  suburb: text(80),
  state: z.enum(australianStates),
  postcode: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "A postcode has 4 digits"),
});

const contact = z.object({
  role: z.enum(contactRoles),
  name: text(120),
  email: optionalEmail,
  phone,
});

export const referralSupportSchema = z.object({
  support: z.enum(supports),
  frequency: z.enum(frequencies),
  frequencyOther: text(120),
  nursingType: z.union([z.literal(""), z.enum(nursingTypes)]),
  details: text(300),
});

export const referralSchema = z
  .object({
    submitter: z.object({
      role: z.enum(submitterRoles),
      name: required("your name", 120),
      organisation: text(120),
      email: optionalEmail,
      phone,
      authorityConfirmed: z.literal(true, "Confirm you're allowed to make this referral"),
    }),
    participant: z.object({
      firstName: required("the participant's first name", 60),
      lastName: required("the participant's last name", 60),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of birth"),
      email: optionalEmail,
      phone,
      address: address.extend({
        street: required("the street address", 160),
        suburb: required("the suburb", 80),
        postcode: z
          .string()
          .trim()
          .regex(/^\d{4}$/, "A postcode has 4 digits"),
      }),
    }),
    funding: z.object({
      source: z.enum(fundingStreams),
      ndisNumber: text(20),
      planEndDate: day,
      planType: z.union([z.literal(""), z.enum(planTypes)]),
      fundingPeriods: z.union([z.literal(""), z.enum(yesNoUnknown)]),
      planManagerCompany: text(120),
      planManagerEmail: optionalEmail,
      otherDetails: text(300),
    }),
    supportCoordinator: z.object({ name: text(120), email: optionalEmail, phone }),
    signatory: contact,
    booking: contact.extend({
      method: z.enum(contactMethods),
      preferredTime: text(120),
    }),
    location: z.object({
      type: z.enum(serviceLocations),
      sameAsHome: z.boolean(),
      address: address,
      contactName: text(120),
      contactEmail: optionalEmail,
      contactPhone: phone,
      contactNotes: text(300),
    }),
    clinical: z.object({
      diagnosis: text(500),
      behaviours: z.enum(yesNoUnknown),
      behavioursDetails: text(1000),
      knownRisk: z.enum(yesNoUnknown),
      riskDetails: text(1000),
      personPresent: z.boolean(),
      personPresentDetails: text(300),
    }),
    supports: z
      .array(referralSupportSchema)
      .min(1, "Choose at least one support")
      .refine(
        (list) => new Set(list.map((s) => s.support)).size === list.length,
        "Each support can only be chosen once",
      ),
    goals: text(3000),
    comments: text(3000),
    consent: z.object({
      privacy: z.literal(true, "Accept the privacy statement to send the referral"),
      shareWithClinicians: z.literal(
        true,
        "Agree that we can share the referral with the clinicians involved",
      ),
    }),
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (r.participant.dateOfBirth < "1900-01-01") {
      issue(["participant", "dateOfBirth"], "Check the year of birth");
    }
    if (r.funding.source === "NDIS") {
      if (!r.funding.ndisNumber) issue(["funding", "ndisNumber"], "Enter the NDIS number");
      if (!r.funding.planEndDate) issue(["funding", "planEndDate"], "Enter the plan end date");
      if (!r.funding.planType) issue(["funding", "planType"], "Choose the plan type");
    }
    if (r.location.type !== "Telehealth" && !r.location.sameAsHome && !r.location.address.street) {
      issue(["location", "address", "street"], "Enter the address of the service location");
    }
    if (r.clinical.behaviours === "Yes" && !r.clinical.behavioursDetails) {
      issue(["clinical", "behavioursDetails"], "Describe the behaviours of concern");
    }
    if (r.clinical.knownRisk === "Yes" && !r.clinical.riskDetails) {
      issue(["clinical", "riskDetails"], "Describe the known risk");
    }
    if (r.clinical.personPresent && !r.clinical.personPresentDetails) {
      issue(["clinical", "personPresentDetails"], "Say who needs to be present");
    }
    r.supports.forEach((s, i) => {
      if (s.support === "Nursing" && !s.nursingType) {
        issue(["supports", i, "nursingType"], "Choose the type of nursing support");
      }
      if (s.support === "Nursing" && s.nursingType === "Other" && !s.details) {
        issue(["supports", i, "details"], "Describe the nursing support needed");
      }
      if (s.support === "Other" && !s.details) {
        issue(["supports", i, "details"], "Describe the support needed");
      }
      if (s.frequency === "Other" && !s.frequencyOther) {
        issue(["supports", i, "frequencyOther"], "Describe how often");
      }
    });
    if (!r.participant.email && !r.booking.email) {
      issue(["booking", "email"], "Give an email for the participant or the booking contact");
    }
  });

export type ReferralInput = z.infer<typeof referralSchema>;
export type ReferralSupportInput = z.infer<typeof referralSupportSchema>;

/** A gap the completeness check found, with the field it belongs to. */
export type Gap = { field: string; label: string };

/**
 * The automated completeness check (lifecycle phase 2). Rules, not AI: it lists what intake will
 * need that the form didn't strictly require, such as the NDIS plan document. An admin verifies
 * the list before anyone is asked for anything.
 */
export function completenessGaps(r: ReferralInput, documents: { kind: string }[]): Gap[] {
  const gaps: Gap[] = [];
  const add = (field: string, label: string) => gaps.push({ field, label });
  if (r.funding.source === "NDIS") {
    if (!documents.some((d) => d.kind === "NDIS plan")) {
      add("document:NDIS plan", "NDIS plan document (or the relevant plan pages)");
    }
    if (r.funding.planType === "Plan Managed" && !r.funding.planManagerCompany) {
      add("funding.planManagerCompany", "Plan manager company");
    }
    if (r.funding.planType === "Plan Managed" && !r.funding.planManagerEmail) {
      add("funding.planManagerEmail", "Plan manager email for invoices");
    }
    if (!r.funding.fundingPeriods || r.funding.fundingPeriods === "Unknown") {
      add("funding.fundingPeriods", "Whether the plan has funding periods");
    }
  } else if (!r.funding.otherDetails) {
    add("funding.otherDetails", `${r.funding.source} details (claim, insurer or payer)`);
  }
  if (!r.signatory.name || (!r.signatory.email && !r.signatory.phone)) {
    add("signatory", "Who signs the service agreement, and how to reach them");
  }
  if (!r.booking.name || !r.booking.phone) add("booking", "Booking contact name and phone");
  if (!r.clinical.diagnosis) add("clinical.diagnosis", "Primary diagnosis (as reported)");
  if (r.clinical.knownRisk === "Unknown") {
    add("clinical.riskDetails", "Whether there is any known risk to the therapist");
  }
  if (isInPerson(r.location.type) && r.location.type !== "Home" && !r.location.contactName) {
    add("location.contact", `${r.location.type} contact person`);
  }
  if (!r.goals) add("goals", "NDIS or personal goals, if known");
  return gaps;
}

/** True when the referral reports a risk that must be clinically reviewed before matching. */
export const needsRiskReview = (r: Pick<ReferralInput, "clinical">) =>
  r.clinical.knownRisk !== "No" || r.clinical.behaviours !== "No";

/** "Occupational Therapy · Weekly", "Nursing · Continence Assessment", "FCA · Assessment". */
export function supportLine(s: ReferralSupportInput) {
  const how =
    s.support === "Nursing" && s.nursingType
      ? s.nursingType
      : s.frequency === "Other"
        ? s.frequencyOther
        : s.frequency;
  return `${s.support} · ${how}`;
}

/** Assessment-only supports are always booked as a single assessment visit. */
export const frequencyFor = (s: ReferralSupportInput) =>
  supportInfo(s.support).kind === "assessment" ? "Assessment" : s.frequency;

/** A blank referral for the form to start from. */
export function emptyReferral(): ReferralInput {
  const contactBlank = { role: "Participant" as const, name: "", email: "", phone: "" };
  const blankAddress = { street: "", suburb: "", state: "QLD" as const, postcode: "" };
  return {
    submitter: {
      role: "Participant",
      name: "",
      organisation: "",
      email: "",
      phone: "",
      authorityConfirmed: false as unknown as true,
    },
    participant: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: blankAddress,
    },
    funding: {
      source: "NDIS",
      ndisNumber: "",
      planEndDate: "",
      planType: "",
      fundingPeriods: "",
      planManagerCompany: "",
      planManagerEmail: "",
      otherDetails: "",
    },
    supportCoordinator: { name: "", email: "", phone: "" },
    signatory: contactBlank,
    booking: { ...contactBlank, method: "Phone", preferredTime: "" },
    location: {
      type: "Home",
      sameAsHome: true,
      address: blankAddress,
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      contactNotes: "",
    },
    clinical: {
      diagnosis: "",
      behaviours: "No",
      behavioursDetails: "",
      knownRisk: "No",
      riskDetails: "",
      personPresent: false,
      personPresentDetails: "",
    },
    supports: [],
    goals: "",
    comments: "",
    consent: { privacy: false as unknown as true, shareWithClinicians: false as unknown as true },
  };
}
