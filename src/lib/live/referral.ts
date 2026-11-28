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
  yesNoUnsure,
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
      fundingPeriods: z.union([z.literal(""), z.enum(yesNoUnsure)]),
      /** F05: only when the plan has funding periods. Dates only; no balance is inferred. */
      periods: z
        .array(z.object({ start: day, end: day }))
        .max(12)
        .default([]),
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
      if (r.funding.fundingPeriods === "Yes") {
        if (!r.funding.periods.length) {
          issue(["funding", "periods"], "Add at least one funding period");
        }
        r.funding.periods.forEach((p, i) => {
          if (!p.start) issue(["funding", "periods", i, "start"], "Enter the start date");
          if (!p.end) issue(["funding", "periods", i, "end"], "Enter the end date");
          if (p.start && p.end && p.start > p.end) {
            issue(["funding", "periods", i, "end"], "The end date must be after the start date");
          }
        });
      }
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
    if (!r.funding.fundingPeriods || r.funding.fundingPeriods === "Unsure") {
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
/** A signed-in patient's verified details, used to fill a new referral (Module 18, scenario G). */
export type KnownPatient = {
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: {
    street: string;
    suburb: string;
    state: (typeof australianStates)[number];
    postcode: string;
  };
  funding: (typeof fundingStreams)[number];
  ndisNumber: string;
  planEndDate: string;
  planType: "" | (typeof planTypes)[number];
};

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
      periods: [],
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

type SampleProfile = {
  ages: [number, number];
  submitter: (typeof submitterRoles)[number];
  funding: (typeof fundingStreams)[number];
  location: (typeof serviceLocations)[number];
  diagnosis: string;
  behaviours: (typeof yesNoUnknown)[number];
  behavioursDetails: string;
  knownRisk: (typeof yesNoUnknown)[number];
  riskDetails: string;
  supports: { support: (typeof supports)[number]; frequency: (typeof frequencies)[number] }[];
  goals: string;
  comments: string;
  otherDetails: string;
};

/** Believable starting points; names, dates, numbers and addresses are drawn fresh each time. */
const sampleProfiles: SampleProfile[] = [
  {
    ages: [5, 11],
    submitter: "Parent or guardian",
    funding: "NDIS",
    location: "Home",
    diagnosis: "Autism spectrum disorder, level 2",
    behaviours: "Yes",
    behavioursDetails:
      "Can become distressed with sudden noise or changes to routine; settles with quiet time.",
    knownRisk: "No",
    riskDetails: "",
    supports: [
      { support: "Occupational Therapy", frequency: "Weekly" },
      { support: "Speech Therapy", frequency: "Fortnightly" },
    ],
    goals: "Build independence with dressing and eating, and use words to ask for help at school.",
    comments: "After-school visits suit best. A parent is always home.",
    otherDetails: "",
  },
  {
    ages: [24, 45],
    submitter: "Support coordinator",
    funding: "NDIS",
    location: "Home",
    diagnosis: "Acquired brain injury after a road accident (2023)",
    behaviours: "No",
    behavioursDetails: "",
    knownRisk: "Unknown",
    riskDetails: "",
    supports: [
      { support: "Functional Capacity Assessment", frequency: "Assessment" },
      { support: "Physiotherapy", frequency: "Weekly" },
    ],
    goals: "Return to cooking simple meals safely and walk to the local shops without help.",
    comments: "Needs a functional capacity report before the plan review.",
    otherDetails: "",
  },
  {
    ages: [3, 6],
    submitter: "Parent or guardian",
    funding: "NDIS",
    location: "Daycare",
    diagnosis: "Global developmental delay",
    behaviours: "No",
    behavioursDetails: "",
    knownRisk: "No",
    riskDetails: "",
    supports: [
      { support: "Speech/Language Assessment", frequency: "Assessment" },
      { support: "Speech Therapy", frequency: "Weekly" },
    ],
    goals: "Use two-word phrases and follow simple instructions at daycare.",
    comments: "Daycare is happy for sessions to happen there on weekday mornings.",
    otherDetails: "",
  },
  {
    ages: [68, 86],
    submitter: "Other referrer",
    funding: "Aged Care",
    location: "Home",
    diagnosis: "Parkinson's disease with two falls in the last three months",
    behaviours: "No",
    behavioursDetails: "",
    knownRisk: "Yes",
    riskDetails: "Small dog at home; family will keep it outside during visits.",
    supports: [
      { support: "Home Mod Assessment", frequency: "Assessment" },
      { support: "Physiotherapy", frequency: "Fortnightly" },
    ],
    goals: "Stay living at home safely and reduce the risk of falls.",
    comments: "Referred by the GP. Daughter manages appointments.",
    otherDetails: "Home Care Package level 3, provider to be confirmed",
  },
  {
    ages: [16, 30],
    submitter: "Participant",
    funding: "NDIS",
    location: "Telehealth",
    diagnosis: "Post-traumatic stress disorder and anxiety",
    behaviours: "No",
    behavioursDetails: "",
    knownRisk: "Unknown",
    riskDetails: "",
    supports: [{ support: "Psychological Therapy", frequency: "Weekly" }],
    goals: "Manage anxiety well enough to keep a part-time job.",
    comments: "Prefers video sessions in the evening.",
    otherDetails: "",
  },
  {
    ages: [35, 60],
    submitter: "Authorised representative",
    funding: "NDIS",
    location: "Day Program",
    diagnosis: "Cerebral palsy (spastic diplegia), uses a wheelchair",
    behaviours: "No",
    behavioursDetails: "",
    knownRisk: "No",
    riskDetails: "",
    supports: [
      { support: "Assistive Technology Assessment", frequency: "Assessment" },
      { support: "Exercise Physiology", frequency: "Weekly" },
    ],
    goals: "Get a new power wheelchair prescribed and keep up strength for transfers.",
    comments: "Attends the day program Monday to Wednesday.",
    otherDetails: "",
  },
  {
    ages: [40, 65],
    submitter: "Other referrer",
    funding: "Private",
    location: "Home",
    diagnosis: "Stroke (left side weakness), discharged from hospital last month",
    behaviours: "No",
    behavioursDetails: "",
    knownRisk: "No",
    riskDetails: "",
    supports: [
      { support: "Occupational Therapy", frequency: "Weekly" },
      { support: "Swallowing Assessment", frequency: "Assessment" },
    ],
    goals: "Regain use of the left hand for everyday tasks and eat a normal diet safely.",
    comments: "Paying privately with health insurance extras.",
    otherDetails: "Private health insurance, extras cover",
  },
];

const firstNames = [
  "Olivia",
  "Liam",
  "Charlotte",
  "Jack",
  "Amelia",
  "Oliver",
  "Isla",
  "Noah",
  "Mia",
  "William",
  "Ava",
  "Lucas",
  "Grace",
  "Henry",
  "Chloe",
  "Ethan",
  "Zoe",
  "Mason",
  "Harper",
  "Lachlan",
  "Priya",
  "Arjun",
  "Mei",
  "Hamish",
  "Aisha",
  "Tane",
  "Sienna",
  "Kai",
  "Ruby",
  "Hugo",
];
const lastNames = [
  "Nguyen",
  "Walsh",
  "Patel",
  "O'Brien",
  "Kowalski",
  "Fraser",
  "Singh",
  "Morrison",
  "Tran",
  "Campbell",
  "Hughes",
  "Russo",
  "Kelly",
  "Bennett",
  "Chen",
  "Doyle",
  "Mackenzie",
  "Ahmed",
  "Turner",
  "Fitzgerald",
  "Papadopoulos",
  "Reid",
  "Lam",
  "Harrington",
  "Novak",
];
const adultNames = [
  "Sarah",
  "Michael",
  "Rebecca",
  "David",
  "Emma",
  "Daniel",
  "Kate",
  "Matthew",
  "Jessica",
  "Andrew",
  "Nicole",
  "Ben",
  "Laura",
  "Chris",
  "Hannah",
];
const streets = [
  "Hawthorne Street",
  "Wattle Avenue",
  "Banksia Crescent",
  "Jacaranda Drive",
  "Kingfisher Way",
  "Bayview Terrace",
  "Lilly Pilly Court",
  "Riverside Road",
  "Moreton Parade",
  "Ironbark Close",
];
const suburbs: [string, string][] = [
  ["Carindale", "4152"],
  ["Chermside", "4032"],
  ["Indooroopilly", "4068"],
  ["Wynnum", "4178"],
  ["Aspley", "4034"],
  ["Mount Gravatt", "4122"],
  ["Toowong", "4066"],
  ["Redcliffe", "4020"],
  ["Springfield Lakes", "4300"],
  ["North Lakes", "4509"],
  ["Sunnybank", "4109"],
  ["Ashgrove", "4060"],
  ["Capalaba", "4157"],
  ["Kedron", "4031"],
  ["Bulimba", "4171"],
];
const organisations = [
  "Brightpath Support Coordination",
  "Riverlink Care Partners",
  "Northside Connect",
  "Bayside Support Services",
  "Compass Coordination",
];
const planManagers = [
  "Plan Partners Australia",
  "My Plan Manager Co",
  "Clearview Plan Management",
  "Leap Plan Services",
];

/**
 * A complete, fictional referral for testing: a new person every time (name, age, address, phone,
 * NDIS number, needs), so a tester can walk a fresh patient from referral to first visit. All
 * emails use example.test, so nothing is ever sent to a real address.
 */
export function sampleReferral(): ReferralInput {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
  const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const digits = (n: number) => Array.from({ length: n }, () => between(0, 9)).join("");
  const mobile = () => `04${digits(2)} ${digits(3)} ${digits(3)}`;
  const slug = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");

  const profile = pick(sampleProfiles);
  const first = pick(firstNames);
  const last = pick(lastNames);
  const now = new Date();
  const age = between(profile.ages[0], profile.ages[1]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateOfBirth = `${now.getFullYear() - age - 1}-${pad(between(1, 12))}-${pad(between(1, 28))}`;
  const [suburb, postcode] = pick(suburbs);
  const street = `${between(2, 180)} ${pick(streets)}`;
  const child = age < 18;
  const email = child ? "" : `${slug(first)}.${slug(last)}${digits(2)}@example.test`;
  const phone = child ? "" : mobile();

  const family = `${pick(adultNames)} ${last}`;
  const familyEmail = `${slug(family)}${digits(2)}@example.test`;
  const familyPhone = mobile();
  const familyRole = profile.funding === "Aged Care" ? "Other" : "Parent or guardian";
  const selfManaged = !child && profile.submitter === "Participant";
  const contactName = selfManaged ? `${first} ${last}` : family;
  const contactEmail = selfManaged ? email : familyEmail;
  const contactPhone = selfManaged ? phone : familyPhone;
  const contactRole = selfManaged ? "Participant" : familyRole;

  const coordinatorName = `${pick(adultNames)} ${pick(lastNames)}`;
  const coordinatorOrg = pick(organisations);
  const coordinatorEmail = `${slug(coordinatorName)}@example.test`;
  const coordinatorPhone = mobile();

  const submitter =
    profile.submitter === "Support coordinator"
      ? {
          name: coordinatorName,
          organisation: coordinatorOrg,
          email: coordinatorEmail,
          phone: coordinatorPhone,
        }
      : profile.submitter === "Other referrer"
        ? {
            name: `Dr ${pick(adultNames)} ${pick(lastNames)}`,
            organisation: `${suburb} Family Practice`,
            email: `referrals.${slug(suburb)}@example.test`,
            phone: `07 3${digits(3)} ${digits(4)}`,
          }
        : profile.submitter === "Participant"
          ? { name: `${first} ${last}`, organisation: "", email, phone }
          : { name: family, organisation: "", email: familyEmail, phone: familyPhone };

  const ndis = profile.funding === "NDIS";
  const planType = ndis ? pick(planTypes) : "";
  const planManager = planType === "Plan Managed" ? pick(planManagers) : "";
  const base = emptyReferral();
  const atHome = profile.location === "Home" || profile.location === "Telehealth";

  return {
    ...base,
    submitter: { role: profile.submitter, ...submitter, authorityConfirmed: true },
    participant: {
      firstName: first,
      lastName: last,
      dateOfBirth,
      email,
      phone,
      address: { street, suburb, state: "QLD", postcode },
    },
    funding: {
      source: profile.funding,
      ndisNumber: ndis ? `43${digits(7)}` : "",
      planEndDate: ndis
        ? `${now.getFullYear() + 1}-${pad(between(1, 12))}-${pad(between(1, 28))}`
        : "",
      planType,
      fundingPeriods: ndis ? pick(["No", "No", "Unsure"] as const) : "",
      periods: [],
      planManagerCompany: planManager,
      planManagerEmail: planManager ? `invoices@${slug(planManager)}.example.test` : "",
      otherDetails: profile.otherDetails,
    },
    supportCoordinator:
      profile.submitter === "Support coordinator" || (ndis && Math.random() < 0.5)
        ? { name: coordinatorName, email: coordinatorEmail, phone: coordinatorPhone }
        : base.supportCoordinator,
    signatory: { role: contactRole, name: contactName, email: contactEmail, phone: contactPhone },
    booking: {
      role: contactRole,
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
      method: pick(contactMethods),
      preferredTime: pick(["Weekday mornings", "Weekday afternoons", "After 3 pm", "Any time"]),
    },
    location: atHome
      ? { ...base.location, type: profile.location, sameAsHome: true }
      : {
          ...base.location,
          type: profile.location,
          sameAsHome: false,
          address: {
            street: `${between(2, 90)} ${pick(streets)}`,
            suburb,
            state: "QLD",
            postcode,
          },
          contactName: `${pick(adultNames)} ${pick(lastNames)}`,
          contactPhone: `07 3${digits(3)} ${digits(4)}`,
          contactEmail: "",
          contactNotes: "Sign in at reception on arrival.",
        },
    clinical: {
      diagnosis: profile.diagnosis,
      behaviours: profile.behaviours,
      behavioursDetails: profile.behavioursDetails,
      knownRisk: profile.knownRisk,
      riskDetails: profile.riskDetails,
      personPresent: child,
      personPresentDetails: child ? `${family} (parent), ${familyPhone}` : "",
    },
    supports: profile.supports.map((s) => ({
      support: s.support,
      frequency: s.frequency,
      frequencyOther: "",
      nursingType: "",
      details: "",
    })),
    goals: profile.goals,
    comments: profile.comments,
    consent: { privacy: true, shareWithClinicians: true },
  };
}
