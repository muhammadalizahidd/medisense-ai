import {
  australianStates,
  contactRoles,
  frequencies,
  fundingStreams,
  planTypes,
  submitterRoles,
  supports,
  yesNoUnknown,
  type Frequency,
  type Support,
} from "./catalogue";
import { emptyReferral, type ReferralInput } from "./referral";

/**
 * What AI reads out of a pasted referral, flat so every provider can return it. Empty strings
 * mean "not in the text"; nothing is guessed.
 */
export type ReferralExtraction = {
  submitterRole: string;
  submitterName: string;
  submitterOrganisation: string;
  submitterEmail: string;
  submitterPhone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  participantEmail: string;
  participantPhone: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  fundingSource: string;
  ndisNumber: string;
  planEndDate: string;
  planType: string;
  planManagerCompany: string;
  planManagerEmail: string;
  coordinatorName: string;
  coordinatorEmail: string;
  coordinatorPhone: string;
  contactRole: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  preferredTime: string;
  diagnosis: string;
  behaviours: string;
  behavioursDetails: string;
  knownRisk: string;
  riskDetails: string;
  supports: { support: string; frequency: string }[];
  goals: string;
  comments: string;
  missing: string[];
};

const str = { type: "string" } as const;

/** The JSON schema the model answers in. */
export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "submitterRole",
    "submitterName",
    "submitterOrganisation",
    "submitterEmail",
    "submitterPhone",
    "firstName",
    "lastName",
    "dateOfBirth",
    "participantEmail",
    "participantPhone",
    "street",
    "suburb",
    "state",
    "postcode",
    "fundingSource",
    "ndisNumber",
    "planEndDate",
    "planType",
    "planManagerCompany",
    "planManagerEmail",
    "coordinatorName",
    "coordinatorEmail",
    "coordinatorPhone",
    "contactRole",
    "contactName",
    "contactEmail",
    "contactPhone",
    "preferredTime",
    "diagnosis",
    "behaviours",
    "behavioursDetails",
    "knownRisk",
    "riskDetails",
    "supports",
    "goals",
    "comments",
    "missing",
  ],
  properties: {
    submitterRole: { type: "string", enum: [...submitterRoles, ""] },
    submitterName: str,
    submitterOrganisation: str,
    submitterEmail: str,
    submitterPhone: str,
    firstName: str,
    lastName: str,
    dateOfBirth: str,
    participantEmail: str,
    participantPhone: str,
    street: str,
    suburb: str,
    state: { type: "string", enum: [...australianStates, ""] },
    postcode: str,
    fundingSource: { type: "string", enum: [...fundingStreams, ""] },
    ndisNumber: str,
    planEndDate: str,
    planType: { type: "string", enum: [...planTypes, ""] },
    planManagerCompany: str,
    planManagerEmail: str,
    coordinatorName: str,
    coordinatorEmail: str,
    coordinatorPhone: str,
    contactRole: { type: "string", enum: [...contactRoles, ""] },
    contactName: str,
    contactEmail: str,
    contactPhone: str,
    preferredTime: str,
    diagnosis: str,
    behaviours: { type: "string", enum: [...yesNoUnknown] },
    behavioursDetails: str,
    knownRisk: { type: "string", enum: [...yesNoUnknown] },
    riskDetails: str,
    supports: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["support", "frequency"],
        properties: {
          support: { type: "string", enum: [...supports] },
          frequency: { type: "string", enum: [...frequencies] },
        },
      },
    },
    goals: str,
    comments: str,
    missing: { type: "array", items: str },
  },
} as const;

const pick = <T extends string>(list: readonly T[], v: string, fallback: T): T =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;
const clean = (v: string | undefined, max = 300) => (v ?? "").trim().slice(0, max);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * Turns what AI read into the live referral form's draft. Values that don't fit the form (a bad
 * date, an unknown option) are left blank for staff to fill. Consent and the referrer's authority
 * are never ticked: a person confirms those.
 */
export function referralFromExtraction(x: Partial<ReferralExtraction>): {
  form: ReferralInput;
  filled: number;
} {
  const f = emptyReferral();
  const email = (v: string | undefined) => (isEmail(clean(v)) ? clean(v) : "");
  f.submitter = {
    ...f.submitter,
    role: pick(submitterRoles, clean(x.submitterRole), "Other referrer"),
    name: clean(x.submitterName, 120),
    organisation: clean(x.submitterOrganisation, 120),
    email: email(x.submitterEmail),
    phone: clean(x.submitterPhone, 20),
  };
  f.participant = {
    firstName: clean(x.firstName, 60),
    lastName: clean(x.lastName, 60),
    dateOfBirth: isDay(clean(x.dateOfBirth)) ? clean(x.dateOfBirth) : "",
    email: email(x.participantEmail),
    phone: clean(x.participantPhone, 20),
    address: {
      street: clean(x.street, 160),
      suburb: clean(x.suburb, 80),
      state: pick(australianStates, clean(x.state), "QLD"),
      postcode: /^\d{4}$/.test(clean(x.postcode)) ? clean(x.postcode) : "",
    },
  };
  f.funding = {
    ...f.funding,
    source: pick(fundingStreams, clean(x.fundingSource), "NDIS"),
    ndisNumber: clean(x.ndisNumber, 20).replace(/\s+/g, ""),
    planEndDate: isDay(clean(x.planEndDate)) ? clean(x.planEndDate) : "",
    planType: pick([...planTypes, ""] as const, clean(x.planType), ""),
    planManagerCompany: clean(x.planManagerCompany, 120),
    planManagerEmail: email(x.planManagerEmail),
  };
  f.supportCoordinator = {
    name: clean(x.coordinatorName, 120),
    email: email(x.coordinatorEmail),
    phone: clean(x.coordinatorPhone, 20),
  };
  const contact = {
    role: pick(contactRoles, clean(x.contactRole), "Participant"),
    name: clean(x.contactName, 120),
    email: email(x.contactEmail),
    phone: clean(x.contactPhone, 20),
  };
  f.signatory = contact;
  f.booking = { ...contact, method: "Phone", preferredTime: clean(x.preferredTime, 120) };
  f.clinical = {
    ...f.clinical,
    diagnosis: clean(x.diagnosis, 500),
    behaviours: pick(yesNoUnknown, clean(x.behaviours), "Unknown"),
    behavioursDetails: clean(x.behavioursDetails, 1000),
    knownRisk: pick(yesNoUnknown, clean(x.knownRisk), "Unknown"),
    riskDetails: clean(x.riskDetails, 1000),
  };
  const seen = new Set<string>();
  f.supports = (x.supports ?? [])
    .filter((s) => (supports as readonly string[]).includes(s.support) && !seen.has(s.support))
    .map((s) => {
      seen.add(s.support);
      return {
        support: s.support as Support,
        frequency: pick<Frequency>(frequencies, s.frequency, "Weekly"),
        frequencyOther: "",
        nursingType: "" as const,
        details: "",
      };
    });
  f.goals = clean(x.goals, 3000);
  f.comments = clean(x.comments, 3000);

  const values = [
    f.submitter.name,
    f.submitter.organisation,
    f.submitter.email,
    f.submitter.phone,
    f.participant.firstName,
    f.participant.lastName,
    f.participant.dateOfBirth,
    f.participant.email,
    f.participant.phone,
    f.participant.address.street,
    f.participant.address.suburb,
    f.participant.address.postcode,
    f.funding.ndisNumber,
    f.funding.planEndDate,
    f.funding.planType,
    f.funding.planManagerCompany,
    f.supportCoordinator.name,
    f.booking.name,
    f.booking.phone,
    f.clinical.diagnosis,
    f.goals,
  ];
  return { form: f, filled: values.filter(Boolean).length + f.supports.length };
}

/** A realistic referral email for the demo, with a gap or two for staff to notice. */
export const sampleReferralEmail = `From: Priya Natarajan <priya.n@brightpathsupport.example>
Subject: New referral – OT for Lucas Bennett

Hi Medisense intake team,

I'm the NDIS support coordinator for Lucas Bennett (DOB 14/03/2015) and would like to refer him for an occupational therapy functional capacity assessment, followed by weekly OT at home.

Lucas lives with his mum, Emma Bennett, at 27 Wattle Street, Chermside QLD 4032. Best contact is Emma on 0412 678 345 (emma.bennett@example.test), weekday mornings.

NDIS number 431 556 782, plan managed by Clearview Plan Partners (invoices@clearview.example). The plan ends 30 June 2027.

Lucas has a diagnosis of autism spectrum disorder (level 2). He finds transitions hard and can become distressed when routines change; no known safety risks at home. Mum will be present at visits.

Goals: dress for school independently, and use a calm-down strategy at school transitions.

Thanks,
Priya Natarajan
Support Coordinator, BrightPath Support Services
0431 220 987`;
