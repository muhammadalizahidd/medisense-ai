"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileUp,
  Lock,
  Paperclip,
  Trash2,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { useNow, useToday } from "@/lib/live/client";
import {
  australianStates,
  contactMethods,
  contactRoles,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  documentKinds,
  fundingStreams,
  isInPerson,
  planTypes,
  serviceLocations,
  submitterRoles,
  yesNoUnknown,
  type DocumentKind,
} from "@/lib/live/catalogue";
import {
  emptyReferral,
  sampleReferral,
  referralSchema,
  supportLine,
  type ReferralInput,
} from "@/lib/live/referral";
import { cn } from "@/lib/cn";
import { Skeleton } from "./bits";
import { Choice, FormGroup, TextArea, TextField, Tick } from "./form-bits";
import { SupportPicker } from "./support-picker";

type Step = { id: string; title: string; caption: string; paths: string[] };

const steps: Step[] = [
  { id: "you", title: "About you", caption: "Who is making the referral", paths: ["submitter"] },
  {
    id: "participant",
    title: "Participant",
    caption: "Name, birth date, address",
    paths: ["participant"],
  },
  { id: "funding", title: "Funding", caption: "NDIS plan or other payer", paths: ["funding"] },
  {
    id: "contacts",
    title: "Contacts",
    caption: "Coordinator, signatory, bookings",
    paths: ["supportCoordinator", "signatory", "booking"],
  },
  {
    id: "location",
    title: "Service location",
    caption: "Where visits happen",
    paths: ["location"],
  },
  {
    id: "supports",
    title: "Supports",
    caption: "What's needed and how often",
    paths: ["supports"],
  },
  {
    id: "clinical",
    title: "Health and safety",
    caption: "Diagnosis, behaviours, risks",
    paths: ["clinical"],
  },
  {
    id: "goals",
    title: "Goals and documents",
    caption: "Goals, comments, files",
    paths: ["goals", "comments"],
  },
  { id: "review", title: "Review and send", caption: "Check and give consent", paths: ["consent"] },
];

type Attached = { id: string; file: File; kind: DocumentKind };
type Sent = {
  id: string;
  reference: string;
  trackingToken: string;
  appCode: string;
  appEmail: string;
};

type Props = {
  mode: "public" | "staff";
  staffName?: string;
  /** Inside the patient app: tells the app when it's sent, and offers a way back. */
  embedded?: boolean;
};

/** Sets a value deep inside the form by its dotted path, without mutating the original. */
function setIn<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const source = obj as Record<string, unknown>;
  return {
    ...source,
    [head!]: rest.length ? setIn(source[head!], rest.join("."), value) : value,
  } as T;
}

/**
 * The participant referral (requirements phases 1–2). Works without an account; staff use the same
 * form to enter a referral they received by phone or email. A draft stays on this device.
 */
export function ReferralForm(props: Props) {
  // The draft lives in this browser, so the form is drawn once the page is running there.
  if (useNow() === null) return <Skeleton className="h-150" />;
  return <ReferralFormBody {...props} />;
}

type Draft = { form: ReferralInput; step: number };

function readDraft(key: string): Draft | null {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Draft;
    return {
      form: { ...emptyReferral(), ...parsed.form },
      step: Math.min(parsed.step ?? 0, steps.length - 1),
    };
  } catch {
    // A damaged draft is ignored; the form starts fresh.
    return null;
  }
}

function ReferralFormBody({ mode, staffName, embedded = false }: Props) {
  const draftKey = `medisense-referral-draft-${embedded ? "app" : mode}`;
  const [draft] = useState(() => readDraft(draftKey));
  const [form, setForm] = useState<ReferralInput>(() => {
    if (draft) return draft.form;
    const blank = emptyReferral();
    if (mode === "staff") {
      blank.submitter = {
        ...blank.submitter,
        role: "Other referrer",
        name: staffName ?? "",
        organisation: "Medisense intake",
        authorityConfirmed: true,
      };
    }
    return blank;
  });
  const restored = draft !== null;
  const [step, setStep] = useState(draft?.step ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Attached[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const today = useToday() ?? "";

  // The draft (lifecycle status: Draft) is kept on this device until the referral is sent.
  useEffect(() => {
    if (sent) return;
    const t = setTimeout(
      () => window.localStorage.setItem(draftKey, JSON.stringify({ form, step })),
      400,
    );
    return () => clearTimeout(t);
  }, [form, step, draftKey, sent]);

  const set = (path: string, value: unknown) => {
    setForm((f) => setIn(f, path, value));
    setErrors((e) => {
      if (!e[path]) return e;
      const next = { ...e };
      delete next[path];
      return next;
    });
  };
  const err = (path: string) => errors[path];

  function issuesFor(only?: string[]) {
    const result = referralSchema.safeParse(form);
    const found: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (only && !only.includes(String(issue.path[0]))) continue;
        found[key] ??= issue.message;
      }
    }
    if ((!only || only.includes("participant")) && form.participant.dateOfBirth > today && today) {
      found["participant.dateOfBirth"] = "The date of birth can't be in the future";
    }
    return found;
  }

  function next() {
    const found = issuesFor(steps[step]!.paths);
    setErrors(found);
    if (Object.keys(found).length) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addFiles(list: FileList | null) {
    setFileError(null);
    if (!list) return;
    const incoming = [...list];
    const bad = incoming.find(
      (f) => !(DOCUMENT_TYPES as readonly string[]).includes(f.type) || f.size > DOCUMENT_MAX_BYTES,
    );
    if (bad) {
      setFileError(`${bad.name}: use a PDF, JPG, PNG or Word file up to 5 MB.`);
      return;
    }
    if (files.length + incoming.length > 6) {
      setFileError("Attach up to 6 files.");
      return;
    }
    setFiles((f) => [
      ...f,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: (/plan/i.test(file.name) ? "NDIS plan" : "Other") as DocumentKind,
      })),
    ]);
  }

  async function submit() {
    const found = issuesFor();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      const at = steps.findIndex((s) => s.paths.includes(first.split(".")[0]!));
      if (at >= 0) setStep(at);
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const body = new FormData();
      body.set("referral", JSON.stringify(form));
      for (const f of files) {
        body.append("files", f.file);
        body.append("kinds", f.kind);
      }
      const response = await fetch(mode === "staff" ? "/api/care/referrals" : "/api/referrals", {
        method: "POST",
        body,
      });
      const json = (await response.json()) as Sent & { error?: string };
      if (!response.ok) throw new Error(json.error ?? "The referral couldn't be sent.");
      window.localStorage.removeItem(draftKey);
      setSent(json);
      if (embedded) {
        window.parent.postMessage(
          {
            type: "medisense-referral",
            reference: json.reference,
            appCode: json.appCode,
            appEmail: json.appEmail,
          },
          window.location.origin,
        );
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "The referral couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const stepsWithErrors = useMemo(
    () =>
      new Set(
        Object.keys(errors).map((k) => steps.findIndex((s) => s.paths.includes(k.split(".")[0]!))),
      ),
    [errors],
  );

  if (sent) {
    return (
      <ReferralSent sent={sent} mode={mode} embedded={embedded} name={form.participant.firstName} />
    );
  }

  const current = steps[step]!;
  const ndis = form.funding.source === "NDIS";
  const inPerson = isInPerson(form.location.type);

  const restoredNote = restored && step === 0 && (
    <p className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-accent-tint px-3 py-2 text-small">
      We brought back the draft you started on this device.
      <button
        type="button"
        className="cursor-pointer font-semibold text-accent underline"
        onClick={() => {
          window.localStorage.removeItem(draftKey);
          window.location.reload();
        }}
      >
        Start again
      </button>
    </p>
  );
  const body = (
    <div className="flex flex-col gap-6">
      {current.id === "you" && (
        <FormGroup
          title="Who is making this referral?"
          description="You don't need an account. We'll give you a private link to follow the referral."
        >
          <div className="md:col-span-2">
            <Choice
              label="I am the"
              options={submitterRoles}
              value={form.submitter.role}
              onChange={(v) => set("submitter.role", v)}
            />
          </div>
          <TextField
            label="Your name"
            required
            value={form.submitter.name}
            onChange={(v) => set("submitter.name", v)}
            error={err("submitter.name")}
            autoComplete="name"
          />
          <TextField
            label="Organisation"
            value={form.submitter.organisation}
            onChange={(v) => set("submitter.organisation", v)}
            hint="If you're referring on behalf of an organisation"
          />
          <TextField
            label="Your email"
            type="email"
            value={form.submitter.email}
            onChange={(v) => set("submitter.email", v)}
            error={err("submitter.email")}
            autoComplete="email"
          />
          <TextField
            label="Your phone"
            type="tel"
            value={form.submitter.phone}
            onChange={(v) => set("submitter.phone", v)}
            error={err("submitter.phone")}
            autoComplete="tel"
          />
          <div className="md:col-span-2">
            <Tick
              checked={form.submitter.authorityConfirmed}
              onChange={(v) => set("submitter.authorityConfirmed", v)}
              error={err("submitter.authorityConfirmed")}
            >
              I confirm I am the participant, or I have their consent or the legal authority to
              refer them. Medisense may ask for evidence of that authority.
            </Tick>
          </div>
        </FormGroup>
      )}

      {current.id === "participant" && (
        <>
          <FormGroup title="Participant">
            <TextField
              label="First name"
              required
              value={form.participant.firstName}
              onChange={(v) => set("participant.firstName", v)}
              error={err("participant.firstName")}
            />
            <TextField
              label="Last name"
              required
              value={form.participant.lastName}
              onChange={(v) => set("participant.lastName", v)}
              error={err("participant.lastName")}
            />
            <TextField
              label="Date of birth"
              type="date"
              required
              max={today}
              min="1900-01-01"
              value={form.participant.dateOfBirth}
              onChange={(v) => set("participant.dateOfBirth", v)}
              error={err("participant.dateOfBirth")}
            />
            <span className="hidden md:block" />
            <TextField
              label="Participant email"
              type="email"
              value={form.participant.email}
              onChange={(v) => set("participant.email", v)}
              error={err("participant.email")}
              hint="Used for the patient app, if they'd like it"
            />
            <TextField
              label="Participant phone"
              type="tel"
              value={form.participant.phone}
              onChange={(v) => set("participant.phone", v)}
              error={err("participant.phone")}
            />
          </FormGroup>
          <FormGroup title="Current address">
            <div className="md:col-span-2">
              <TextField
                label="Street address"
                required
                value={form.participant.address.street}
                onChange={(v) => set("participant.address.street", v)}
                error={err("participant.address.street")}
                autoComplete="street-address"
              />
            </div>
            <TextField
              label="Suburb"
              required
              value={form.participant.address.suburb}
              onChange={(v) => set("participant.address.suburb", v)}
              error={err("participant.address.suburb")}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="State">
                <Select
                  value={form.participant.address.state}
                  onChange={(e) => set("participant.address.state", e.target.value)}
                >
                  {australianStates.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <TextField
                label="Postcode"
                required
                value={form.participant.address.postcode}
                onChange={(v) => set("participant.address.postcode", v)}
                error={err("participant.address.postcode")}
              />
            </div>
          </FormGroup>
        </>
      )}

      {current.id === "funding" && (
        <FormGroup title="How will services be funded?">
          <div className="md:col-span-2">
            <Choice
              label="Funding source"
              options={fundingStreams}
              value={form.funding.source}
              onChange={(v) => set("funding.source", v)}
            />
          </div>
          {ndis ? (
            <>
              <TextField
                label="NDIS number"
                required
                value={form.funding.ndisNumber}
                onChange={(v) => set("funding.ndisNumber", v)}
                error={err("funding.ndisNumber")}
              />
              <TextField
                label="Plan end date"
                type="date"
                required
                value={form.funding.planEndDate}
                onChange={(v) => set("funding.planEndDate", v)}
                error={err("funding.planEndDate")}
              />
              <div className="md:col-span-2">
                <Choice
                  label="Plan type"
                  options={planTypes}
                  value={form.funding.planType}
                  onChange={(v) => set("funding.planType", v)}
                  error={err("funding.planType")}
                />
              </div>
              <div className="md:col-span-2">
                <Choice
                  label="Does the plan have funding periods?"
                  options={yesNoUnknown}
                  value={form.funding.fundingPeriods}
                  onChange={(v) => set("funding.fundingPeriods", v)}
                />
              </div>
              {form.funding.planType === "Plan Managed" && (
                <>
                  <TextField
                    label="Plan manager company"
                    value={form.funding.planManagerCompany}
                    onChange={(v) => set("funding.planManagerCompany", v)}
                  />
                  <TextField
                    label="Plan manager email"
                    type="email"
                    value={form.funding.planManagerEmail}
                    onChange={(v) => set("funding.planManagerEmail", v)}
                    error={err("funding.planManagerEmail")}
                    hint="Where invoices go"
                  />
                </>
              )}
            </>
          ) : (
            <div className="md:col-span-2">
              <TextArea
                label={`${form.funding.source} details`}
                value={form.funding.otherDetails}
                onChange={(v) => set("funding.otherDetails", v)}
                rows={3}
                placeholder={
                  form.funding.source === "Workers Compensation"
                    ? "Insurer, claim number and case manager"
                    : form.funding.source === "Aged Care"
                      ? "Home Care Package level and provider, or other program"
                      : "Who pays, and any reference number"
                }
              />
            </div>
          )}
        </FormGroup>
      )}

      {current.id === "contacts" && (
        <>
          <FormGroup title="Support coordinator" description="If the participant has one.">
            <TextField
              label="Name"
              value={form.supportCoordinator.name}
              onChange={(v) => set("supportCoordinator.name", v)}
            />
            <TextField
              label="Email"
              type="email"
              value={form.supportCoordinator.email}
              onChange={(v) => set("supportCoordinator.email", v)}
              error={err("supportCoordinator.email")}
            />
            <TextField
              label="Phone"
              type="tel"
              value={form.supportCoordinator.phone}
              onChange={(v) => set("supportCoordinator.phone", v)}
              error={err("supportCoordinator.phone")}
            />
          </FormGroup>
          <ContactGroup
            title="Who signs the service agreement?"
            path="signatory"
            form={form}
            set={set}
            err={err}
          />
          <ContactGroup
            title="Who should we call to book visits?"
            path="booking"
            form={form}
            set={set}
            err={err}
          >
            <div className="md:col-span-2">
              <Choice
                label="Preferred contact method"
                options={contactMethods}
                value={form.booking.method}
                onChange={(v) => set("booking.method", v)}
              />
            </div>
            <TextField
              label="Best time to contact"
              value={form.booking.preferredTime}
              onChange={(v) => set("booking.preferredTime", v)}
              placeholder="For example, weekday mornings"
            />
          </ContactGroup>
        </>
      )}

      {current.id === "location" && (
        <FormGroup title="Where should the service happen?">
          <div className="md:col-span-2">
            <Choice
              label="Preferred service location"
              options={serviceLocations}
              value={form.location.type}
              onChange={(v) => set("location.type", v)}
            />
          </div>
          {inPerson && (
            <div className="md:col-span-2">
              <Tick
                checked={form.location.sameAsHome}
                onChange={(v) => set("location.sameAsHome", v)}
              >
                Same as the participant&apos;s current address
              </Tick>
            </div>
          )}
          {inPerson && !form.location.sameAsHome && (
            <>
              <div className="md:col-span-2">
                <TextField
                  label="Street address"
                  required
                  value={form.location.address.street}
                  onChange={(v) => set("location.address.street", v)}
                  error={err("location.address.street")}
                />
              </div>
              <TextField
                label="Suburb"
                value={form.location.address.suburb}
                onChange={(v) => set("location.address.suburb", v)}
              />
              <TextField
                label="Postcode"
                value={form.location.address.postcode}
                onChange={(v) => set("location.address.postcode", v)}
                error={err("location.address.postcode")}
              />
            </>
          )}
          {form.location.type !== "Home" && (
            <>
              <TextField
                label={`${form.location.type === "Telehealth" ? "Support person" : "Location"} contact name`}
                value={form.location.contactName}
                onChange={(v) => set("location.contactName", v)}
              />
              <TextField
                label="Contact phone"
                type="tel"
                value={form.location.contactPhone}
                onChange={(v) => set("location.contactPhone", v)}
                error={err("location.contactPhone")}
              />
              <TextField
                label="Contact email"
                type="email"
                value={form.location.contactEmail}
                onChange={(v) => set("location.contactEmail", v)}
                error={err("location.contactEmail")}
              />
              <TextField
                label="Access notes"
                value={form.location.contactNotes}
                onChange={(v) => set("location.contactNotes", v)}
                placeholder="Sign-in, parking, times that suit"
              />
            </>
          )}
        </FormGroup>
      )}

      {current.id === "supports" && (
        <>
          {err("supports") && (
            <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              {err("supports")}
            </p>
          )}
          <SupportPicker
            value={form.supports}
            onChange={(v) => set("supports", v)}
            errorFor={err}
          />
        </>
      )}

      {current.id === "clinical" && (
        <>
          <FormGroup
            title="Health"
            description="As reported in the referral. A clinician confirms everything at the first visit."
          >
            <div className="md:col-span-2">
              <TextArea
                label="Accepted or primary diagnosis"
                value={form.clinical.diagnosis}
                onChange={(v) => set("clinical.diagnosis", v)}
                rows={3}
              />
            </div>
          </FormGroup>
          <FormGroup
            title="Safety"
            description="This helps us send the right clinician and keep everyone safe. If you're not sure, choose Unknown."
          >
            <div className="md:col-span-2">
              <Choice
                label="Are there behaviours of concern?"
                options={yesNoUnknown}
                value={form.clinical.behaviours}
                onChange={(v) => set("clinical.behaviours", v)}
              />
            </div>
            {form.clinical.behaviours === "Yes" && (
              <div className="md:col-span-2">
                <TextArea
                  label="Describe the behaviours of concern"
                  required
                  value={form.clinical.behavioursDetails}
                  onChange={(v) => set("clinical.behavioursDetails", v)}
                  error={err("clinical.behavioursDetails")}
                  rows={3}
                />
              </div>
            )}
            <div className="md:col-span-2">
              <Choice
                label="Is there any known risk to a visiting therapist?"
                options={yesNoUnknown}
                value={form.clinical.knownRisk}
                onChange={(v) => set("clinical.knownRisk", v)}
                hint="For example, animals, people at the address, or the environment."
              />
            </div>
            {form.clinical.knownRisk !== "No" && (
              <div className="md:col-span-2">
                <TextArea
                  label="Describe the risk"
                  required={form.clinical.knownRisk === "Yes"}
                  value={form.clinical.riskDetails}
                  onChange={(v) => set("clinical.riskDetails", v)}
                  error={err("clinical.riskDetails")}
                  rows={3}
                />
              </div>
            )}
            <div className="md:col-span-2">
              <Tick
                checked={form.clinical.personPresent}
                onChange={(v) => set("clinical.personPresent", v)}
              >
                A specific person must be present at visits
              </Tick>
            </div>
            {form.clinical.personPresent && (
              <div className="md:col-span-2">
                <TextField
                  label="Who, their relationship and phone"
                  required
                  value={form.clinical.personPresentDetails}
                  onChange={(v) => set("clinical.personPresentDetails", v)}
                  error={err("clinical.personPresentDetails")}
                />
              </div>
            )}
          </FormGroup>
        </>
      )}

      {current.id === "goals" && (
        <>
          <FormGroup title="Goals and comments">
            <div className="md:col-span-2">
              <TextArea
                label="NDIS goals, if known"
                value={form.goals}
                onChange={(v) => set("goals", v)}
                rows={4}
              />
            </div>
            <div className="md:col-span-2">
              <TextArea
                label="Additional comments or servicing requirements"
                value={form.comments}
                onChange={(v) => set("comments", v)}
                rows={4}
              />
            </div>
          </FormGroup>
          <FormGroup
            title="Documents"
            description="NDIS plan pages, referral letters or reports. PDF, JPG, PNG or Word, up to 5 MB each."
          >
            <div className="md:col-span-2">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-canvas px-4 py-6 text-center hover:border-accent hover:bg-accent-tint">
                <FileUp className="size-6 text-accent" aria-hidden="true" />
                <span className="text-small font-semibold">Choose files</span>
                <span className="text-caption text-ink-500">Up to 6 files</span>
                <input
                  type="file"
                  multiple
                  accept={DOCUMENT_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {fileError && (
                <p role="alert" className="mt-2 text-small text-over">
                  {fileError}
                </p>
              )}
              {files.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center gap-3 rounded-control border border-border px-3 py-2"
                    >
                      <Paperclip className="size-4 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-small">{f.file.name}</span>
                      <div className="w-44">
                        <Select
                          aria-label={`What is ${f.file.name}?`}
                          value={f.kind}
                          onChange={(e) =>
                            setFiles((all) =>
                              all.map((x) =>
                                x.id === f.id ? { ...x, kind: e.target.value as DocumentKind } : x,
                              ),
                            )
                          }
                        >
                          {documentKinds.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </Select>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${f.file.name}`}
                        onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}
                        className="cursor-pointer rounded-control p-1.5 text-ink-500 hover:bg-canvas hover:text-over"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FormGroup>
        </>
      )}

      {current.id === "review" && (
        <>
          <dl className="grid gap-x-6 gap-y-3 rounded-card bg-canvas p-4 text-small md:grid-cols-[180px_1fr]">
            <dt className="text-ink-500">Participant</dt>
            <dd className="font-semibold">
              {form.participant.firstName} {form.participant.lastName},{" "}
              {form.participant.address.suburb}
            </dd>
            <dt className="text-ink-500">Funding</dt>
            <dd>
              {form.funding.source}
              {ndis && form.funding.planType ? ` · ${form.funding.planType}` : ""}
            </dd>
            <dt className="text-ink-500">Location</dt>
            <dd>{form.location.type}</dd>
            <dt className="text-ink-500">Supports</dt>
            <dd>
              {form.supports.length ? form.supports.map(supportLine).join("; ") : "None chosen"}
            </dd>
            <dt className="text-ink-500">Safety</dt>
            <dd>
              Behaviours of concern: {form.clinical.behaviours}. Known risk:{" "}
              {form.clinical.knownRisk}.
            </dd>
            <dt className="text-ink-500">Booking contact</dt>
            <dd>{form.booking.name || "Not given"}</dd>
            <dt className="text-ink-500">Documents</dt>
            <dd>{files.length ? `${files.length} attached` : "None"}</dd>
          </dl>
          <div className="flex flex-col gap-3">
            <Tick
              checked={form.consent.privacy}
              onChange={(v) => set("consent.privacy", v)}
              error={err("consent.privacy")}
            >
              I have read how Medisense collects, stores and uses personal and health information,
              and agree to it being used to assess and deliver the services requested.
            </Tick>
            <Tick
              checked={form.consent.shareWithClinicians}
              onChange={(v) => set("consent.shareWithClinicians", v)}
              error={err("consent.shareWithClinicians")}
            >
              I agree that Medisense may share this referral with the clinicians involved in the
              participant&apos;s care.
            </Tick>
          </div>
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              Some answers need attention. The steps marked in red show where.
            </p>
          )}
          {submitError && (
            <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              {submitError}
            </p>
          )}
        </>
      )}
    </div>
  );
  const isLast = step === steps.length - 1;
  /** Fills every step with fictional details and jumps to the review, for testing and demos. */
  const fillSample = () => {
    setForm(sampleReferral());
    setErrors({});
    setStep(steps.length - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  // Inside the patient app: a phone-first layout with a sticky stepper and a sticky action bar.
  if (embedded) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        <header className="sticky top-0 z-10 border-b border-border bg-surface/95 px-5 pt-4 pb-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-caps text-accent">
              Step {step + 1} of {steps.length}
            </p>
            <button
              type="button"
              onClick={fillSample}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-caption font-semibold text-accent hover:bg-accent-tint"
            >
              <FlaskConical className="size-3" aria-hidden="true" /> Fill sample data
            </button>
          </div>
          <h2 id="step-title" className="mt-1 type-display text-[26px] leading-[1.1]">
            {current.title}
          </h2>
          <p className="mt-0.5 text-caption text-ink-500">{current.caption}</p>
          <ol aria-label="Referral steps" className="mt-3 flex gap-1">
            {steps.map((s, i) => {
              const flagged = stepsWithErrors.has(i);
              return (
                <li key={s.id} className="flex-1">
                  <button
                    type="button"
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    aria-current={i === step ? "step" : undefined}
                    disabled={i > step}
                    onClick={() => i <= step && setStep(i)}
                    className={cn(
                      "block h-1.5 w-full rounded-full transition-colors duration-300",
                      flagged
                        ? "bg-over-dot"
                        : i < step
                          ? "cursor-pointer bg-accent-fill"
                          : i === step
                            ? "bg-accent-fill/60"
                            : "bg-border",
                    )}
                  />
                </li>
              );
            })}
          </ol>
        </header>
        <div className="flex-1 px-5 pt-5 pb-8">
          {restoredNote && <div className="mb-5">{restoredNote}</div>}
          {body}
        </div>
        <footer className="sticky bottom-0 z-10 flex gap-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
          {step > 0 && (
            <Button className="h-11 px-4" onClick={goBack} aria-label="Back">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="primary"
            className="h-11 flex-1 text-body"
            disabled={busy}
            onClick={isLast ? submit : next}
          >
            {isLast ? (busy ? "Sending…" : "Send referral") : "Continue"}
            {!isLast && <ArrowRight className="size-4" aria-hidden="true" />}
          </Button>
        </footer>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Referral steps" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {steps.map((s, i) => {
            const done = i < step;
            const flagged = stepsWithErrors.has(i);
            return (
              <li key={s.id} className="flex-none">
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  disabled={i > step}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left",
                    i === step ? "bg-surface shadow-hairline" : "hover:bg-surface/60",
                    i > step ? "cursor-default opacity-60" : "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 flex-none items-center justify-center rounded-full text-caption font-bold",
                      flagged
                        ? "bg-over-bg text-over"
                        : done
                          ? "bg-accent-fill text-on-accent"
                          : i === step
                            ? "bg-ink-900 text-surface"
                            : "bg-canvas text-ink-500",
                    )}
                  >
                    {done && !flagged ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block text-small font-semibold">{s.title}</span>
                    <span className="block truncate text-caption text-ink-500">{s.caption}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 hidden items-start gap-2 text-caption text-ink-500 lg:flex">
          <Lock className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
          Your answers are saved as a draft on this device until you send them.
        </p>
        <button
          type="button"
          onClick={fillSample}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-border-strong px-3 py-2 text-caption font-semibold text-accent hover:border-accent hover:bg-accent-tint lg:w-auto"
        >
          <FlaskConical className="size-3.5" aria-hidden="true" /> Fill sample data (testing)
        </button>
      </nav>

      <section
        aria-labelledby="step-title"
        className="min-w-0 rounded-card border border-border bg-surface p-5 sm:p-7"
      >
        <p className="label-caps">
          Step {step + 1} of {steps.length}
        </p>
        <h2 id="step-title" className="mt-1 type-display text-h2">
          {current.title}
        </h2>
        {restoredNote}
        <div className="mt-6">{body}</div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          {step > 0 ? (
            <Button onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
          ) : mode === "staff" ? (
            <ButtonLink href="/care/referrals">Cancel</ButtonLink>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continue
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Send referral"}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function ContactGroup({
  title,
  path,
  form,
  set,
  err,
  children,
}: {
  title: string;
  path: "signatory" | "booking";
  form: ReferralInput;
  set: (path: string, value: unknown) => void;
  err: (path: string) => string | undefined;
  children?: React.ReactNode;
}) {
  const value = form[path];
  return (
    <FormGroup title={title}>
      <div className="md:col-span-2">
        <Choice
          label="Role"
          options={contactRoles}
          value={value.role}
          onChange={(v) => set(`${path}.role`, v)}
        />
      </div>
      <TextField label="Name" value={value.name} onChange={(v) => set(`${path}.name`, v)} />
      <TextField
        label="Phone"
        type="tel"
        value={value.phone}
        onChange={(v) => set(`${path}.phone`, v)}
        error={err(`${path}.phone`)}
      />
      <TextField
        label="Email"
        type="email"
        value={value.email}
        onChange={(v) => set(`${path}.email`, v)}
        error={err(`${path}.email`)}
      />
      {children}
    </FormGroup>
  );
}

function ReferralSent({
  sent,
  mode,
  name,
  embedded,
}: {
  sent: Sent;
  mode: "public" | "staff";
  name: string;
  embedded: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const link =
    typeof window === "undefined"
      ? `/refer/track/${sent.trackingToken}`
      : `${window.location.origin}/refer/track/${sent.trackingToken}`;
  return (
    <div className={embedded ? "px-5 py-8" : "mx-auto max-w-160"}>
      <div
        className={
          embedded ? "text-center" : "rounded-card border border-border bg-surface p-7 text-center"
        }
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-healthy-bg text-healthy">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <h2 className="mt-4 type-display text-h1">Referral received</h2>
        <p className="mt-2 text-small text-ink-700">
          Thank you. {name ? `${name}'s` : "The"} referral is with our intake team. Your reference
          is
        </p>
        <p className="my-3 font-mono text-h1 tracking-widest">{sent.reference}</p>
        <div className="mt-5 rounded-card border-2 border-accent bg-accent-tint p-4 text-left">
          <p className="text-small font-semibold">
            {mode === "staff" ? "The family's app code" : "Your app code"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 font-mono text-h2 tracking-[0.2em]">{sent.appCode}</span>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(sent.appCode);
                setCodeCopied(true);
              }}
            >
              {codeCopied ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {codeCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-caption text-ink-700">
            {mode === "staff" ? "Give this to the family. They" : "Keep this code. You"} open the
            Medisense patient app, choose <strong>I have a code</strong> and enter this code. Until
            the referral is accepted it shows progress; once accepted, the same code opens the app.
          </p>
        </div>
        <div className="mt-5 rounded-control border border-border bg-canvas p-4 text-left">
          <p className="text-small font-semibold">Your private tracking link</p>
          <p className="mt-1 text-caption text-ink-500">
            Keep this link. It shows the referral&apos;s progress and is where you answer any
            questions we have. Anyone with the link can see the status, so don&apos;t share it.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-control bg-surface px-3 py-2 text-caption">
              {link}
            </code>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {embedded ? (
            <Button
              variant="primary"
              onClick={() =>
                window.parent.postMessage(
                  { type: "medisense-referral-close" },
                  window.location.origin,
                )
              }
            >
              Back to the app
            </Button>
          ) : mode === "staff" ? (
            <ButtonLink href={`/care/referrals/${sent.id}`} variant="primary">
              Open in intake
            </ButtonLink>
          ) : (
            <ButtonLink href={`/refer/track/${sent.trackingToken}`} variant="primary">
              Track this referral
            </ButtonLink>
          )}
          <Link
            href={mode === "staff" ? "/care/referrals" : "/refer"}
            className="self-center px-3 text-small font-semibold text-accent"
            onClick={() => mode === "public" && window.location.reload()}
          >
            {mode === "staff" ? "Back to referrals" : "Make another referral"}
          </Link>
        </div>
      </div>
    </div>
  );
}
