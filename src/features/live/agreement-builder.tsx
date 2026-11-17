"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  FilePen,
  FileText,
  GitBranch,
  History,
  Link2,
  ListPlus,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useResource } from "@/lib/live/client";
import {
  aud,
  communicationNeeds,
  deliverySettings,
  lineEstimate,
  lineFrequencies,
  lineKinds,
  occurrences,
  serviceUnits,
  sharingMethods,
  signatoryAuthorities,
  type AgreementDto,
  type AgreementInput,
  type LineInput,
} from "@/lib/live/funding";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { AgreementDocument } from "./agreement-document";
import { Choice, TextArea, TextField } from "./form-bits";
import { agreementTone, dayLabel, FCard, ManagementChip } from "./funding-bits";

type Detail = {
  agreement: AgreementDto;
  plans: {
    id: string;
    ref: string;
    end: string;
    geography: string;
    budgets: {
      id: string;
      name: string;
      management: string;
      payer: string;
      travelAllowed: boolean;
      priceItemId: string;
    }[];
  }[];
  planId: string;
  priceItems: {
    id: string;
    code: string;
    name: string;
    unit: string;
    edition: string;
    effectiveFrom: string;
    limit: number | null;
    active: boolean;
    supports: string[];
  }[];
  needs: { id: string; support: string; frequency: string; location: string }[];
  contacts: {
    id: string;
    name: string;
    role: string;
    email: string;
    state: string;
    authority: string;
    responsibilities: string[];
  }[];
  client: { id: string; name: string; mrn: string | null; email: string };
  rightsBlocks: readonly { key: string; title: string; text: string }[];
  can: { verify: boolean; edit: boolean };
  me: string;
};

const steps = ["Draft", "Internal Review", "Issued", "Viewed", "Signed"] as const;

const tabs = [
  { id: "builder", label: "Agreement builder" },
  { id: "preview", label: "Participant view" },
  { id: "history", label: "Versions and history" },
] as const;

async function act(id: string, body: unknown, ok: string, detail?: string) {
  try {
    const res = await api<{ link?: string; agreementId?: string }>(
      `/api/care/funding/agreements/${id}`,
      { body },
    );
    toast(ok, { tone: "success", detail });
    return res;
  } catch (e) {
    toast("Couldn't do that", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

/** Module 06: build, review, issue and amend one service agreement version. */
export function AgreementBuilder({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<Detail>(
    `/api/care/funding/agreements/${id}`,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  // Kept above the keyed view, so the new secure link survives the reload after issuing.
  const [link, setLink] = useState<string | null>(null);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[640px]" />;
  return (
    <Loaded
      key={data.agreement.updatedAt}
      d={data}
      tab={tab}
      setTab={setTab}
      reload={reload}
      link={link}
      setLink={setLink}
    />
  );
}

function Loaded({
  d,
  tab,
  setTab,
  reload,
  link,
  setLink,
}: {
  d: Detail;
  tab: (typeof tabs)[number]["id"];
  setTab: (t: (typeof tabs)[number]["id"]) => void;
  reload: () => void;
  link: string | null;
  setLink: (link: string | null) => void;
}) {
  const a = d.agreement;
  const router = useRouter();
  const editable = a.status === "Draft" && d.can.edit;
  const [form, setForm] = useState<AgreementInput>({
    start: a.start,
    end: a.end,
    planId: a.planId,
    signatory: {
      contactId: a.signatory.contactId,
      name: a.signatory.name,
      email: a.signatory.email,
      authority: a.signatory.authority as AgreementInput["signatory"]["authority"],
    },
    lines: a.lines.map((l) => ({
      id: l.id,
      needId: l.needId,
      support: l.support,
      kind: l.kind,
      scope: l.scope,
      deliverySetting: l.deliverySetting,
      unit: l.unit,
      quantity: l.quantity,
      frequency: l.frequency,
      unitPrice: l.unitPrice,
      priceItemId: l.priceItemId,
      budgetId: l.budgetId,
    })),
    cancellation: a.cancellation,
    rights: a.rights,
    communication: a.communication as AgreementInput["communication"],
    communicationNote: a.communicationNote,
    sharing: a.sharing as AgreementInput["sharing"],
    reason: "",
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "signatory" | "review" | "cancel" | "amend">(null);
  const plan = d.plans.find((p) => p.id === form.planId) ?? null;

  const update = (patch: Partial<AgreementInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const setLine = (i: number, patch: Partial<LineInput>) =>
    update({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const total = form.lines.reduce((s, l) => s + lineEstimate(l, form.start, form.end), 0);
  const byPayer = new Map<string, number>();
  for (const l of form.lines) {
    const b = plan?.budgets.find((x) => x.id === l.budgetId);
    const key = b ? `${b.management}: ${b.payer}` : "No budget linked";
    byPayer.set(key, (byPayer.get(key) ?? 0) + lineEstimate(l, form.start, form.end));
  }

  async function save() {
    setBusy(true);
    const res = await act(
      a.id,
      { type: "save", agreement: form },
      "Draft saved",
      "Review reasons and warnings are recalculated.",
    );
    setBusy(false);
    if (res) {
      setDirty(false);
      reload();
    }
  }

  const stepIndex =
    a.status === "Changes Requested" || a.status === "Declined"
      ? 3
      : steps.indexOf(a.status as (typeof steps)[number]);

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href={`/care/funding/${a.clientId}?tab=agreements`} variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> {a.participant}
          </ButtonLink>
        }
        title={
          <span className="font-mono">
            {a.ref} · v{a.version}
          </span>
        }
        actions={<LiveBadge />}
      />

      <section className="mb-5 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="flex flex-wrap items-center gap-4 px-6 py-5">
          <span className="flex size-12 items-center justify-center rounded-card bg-accent-tint text-accent">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="type-display text-h2 text-ink-900">{a.type} agreement</span>
              <Tag tone={agreementTone[a.status]}>{a.status}</Tag>
              {a.review.required && (
                <Tag tone={a.review.by ? "healthy" : "watch"}>
                  {a.review.by ? "Review approved" : "Needs internal review"}
                </Tag>
              )}
            </p>
            <p className="mt-1 text-small text-ink-700">
              {a.participant} · {dayLabel(a.start)} to {dayLabel(a.end)} · signatory{" "}
              {a.signatory.name}{" "}
              {a.signatory.verified ? (
                <span className="font-semibold text-healthy">(authority verified)</span>
              ) : (
                <span className="font-semibold text-watch">(authority not verified)</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
              Estimated total
            </p>
            <p className="type-display text-h1-compact text-ink-900">
              {aud(dirty ? total : a.total)}
            </p>
          </div>
        </div>
        <ol className="flex border-t border-border">
          {steps.map((s, i) => {
            const done = i < stepIndex || a.status === "Signed";
            const current = i === stepIndex && a.status !== "Signed";
            return (
              <li
                key={s}
                className={cn(
                  "flex flex-1 items-center gap-2 px-4 py-3 text-caption",
                  current
                    ? "bg-accent-tint font-semibold text-accent"
                    : done
                      ? "text-ink-900"
                      : "text-ink-400",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 flex-none items-center justify-center rounded-full text-label",
                    done
                      ? "bg-healthy-dot text-surface"
                      : current
                        ? "bg-accent-fill text-on-accent"
                        : "bg-sunken text-ink-500",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s === "Signed" &&
                ["Declined", "Changes Requested", "Expired", "Superseded", "Cancelled"].includes(
                  a.status,
                )
                  ? a.status
                  : s}
              </li>
            );
          })}
        </ol>
      </section>

      <Tabs label="Agreement" tabs={tabs} value={tab} onChange={setTab} />

      <TabPanel id="builder" value={tab}>
        <div className="grid items-stretch gap-6 xl:grid-cols-12">
          <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
            <FCard icon={Users} title="Parties and period" sub={`Provider: ${a.provider}`}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-caption font-semibold text-ink-700">NDIS plan</span>
                  <Select
                    aria-label="Plan"
                    disabled={!editable}
                    value={form.planId}
                    onChange={(e) =>
                      update({
                        planId: e.target.value,
                        lines: form.lines.map((l) => ({ ...l, budgetId: "" })),
                      })
                    }
                  >
                    <option value="">No plan (not NDIS-funded)</option>
                    {d.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.ref} · ends {p.end ? dayLabel(p.end) : "not recorded"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {editable ? (
                    <>
                      <TextField
                        label="Start"
                        type="date"
                        value={form.start}
                        onChange={(v) => update({ start: v })}
                      />
                      <TextField
                        label="End"
                        type="date"
                        value={form.end}
                        onChange={(v) => update({ end: v })}
                      />
                    </>
                  ) : (
                    <>
                      <ReadOnly label="Start" value={dayLabel(a.start)} />
                      <ReadOnly label="End" value={dayLabel(a.end)} />
                    </>
                  )}
                </div>
                {editable ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-caption font-semibold text-ink-700">Signatory</span>
                      <Select
                        aria-label="Signatory"
                        value={form.signatory.contactId}
                        onChange={(e) => {
                          const c = d.contacts.find((x) => x.id === e.target.value);
                          update({
                            signatory: c
                              ? {
                                  contactId: c.id,
                                  name: c.name,
                                  email: c.email,
                                  authority:
                                    c.role === "Participant"
                                      ? "Participant (self)"
                                      : c.role === "Parent" || c.role === "Guardian"
                                        ? "Parent or guardian of a minor"
                                        : c.role === "Nominee"
                                          ? "Plan nominee"
                                          : "Other authorised representative",
                                }
                              : {
                                  contactId: "",
                                  name: d.client.name,
                                  email: d.client.email,
                                  authority: "Participant (self)",
                                },
                          });
                        }}
                      >
                        <option value="">{d.client.name} (participant)</option>
                        {d.contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.role} · {c.state}
                            {c.responsibilities.includes("Consent/Signatory") ? " · signatory" : ""}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-caption font-semibold text-ink-700">
                        Authority to sign
                      </span>
                      <Select
                        aria-label="Authority"
                        value={form.signatory.authority}
                        onChange={(e) =>
                          update({
                            signatory: {
                              ...form.signatory,
                              authority: e.target.value as AgreementInput["signatory"]["authority"],
                            },
                          })
                        }
                      >
                        {signatoryAuthorities.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </Select>
                    </div>
                    <TextField
                      label="Signatory email"
                      type="email"
                      value={form.signatory.email}
                      onChange={(v) => update({ signatory: { ...form.signatory, email: v } })}
                      hint="Needed when sharing by authorised email"
                    />
                    <div className="flex items-end">
                      <Button
                        variant={a.signatory.verified ? "secondary" : "soft"}
                        disabled={a.signatory.verified || dirty}
                        title={dirty ? "Save the draft first" : undefined}
                        onClick={() => setSheet("signatory")}
                      >
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        {a.signatory.verified
                          ? `Verified by ${a.signatory.verifiedBy}`
                          : "Verify signatory authority"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <ReadOnly
                      label="Signatory"
                      value={`${a.signatory.name} · ${a.signatory.authority}`}
                    />
                    <ReadOnly
                      label="Authority"
                      value={
                        a.signatory.verified
                          ? `Verified by ${a.signatory.verifiedBy}`
                          : "Not verified"
                      }
                    />
                  </>
                )}
              </div>
            </FCard>

            <FCard
              icon={ListPlus}
              title="Service lines"
              sub="Each line has its own scope, unit, price, budget and payer. Travel and non-face-to-face are separate lines."
              flush
              action={
                editable && (
                  <div className="flex flex-wrap gap-1.5">
                    {lineKinds.map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant="soft"
                        onClick={() => {
                          const need = d.needs[0];
                          update({
                            lines: [
                              ...form.lines,
                              {
                                needId: need?.id ?? "",
                                support: need?.support ?? "Other",
                                kind: k,
                                scope:
                                  k === "Travel"
                                    ? "Provider travel to the visit, per kilometre, only when it applies."
                                    : k === "Report"
                                      ? "Report writing, as agreed."
                                      : k === "Non-face-to-face"
                                        ? "Non-face-to-face work such as planning and liaison, as agreed."
                                        : "",
                                deliverySetting:
                                  (need?.location as LineInput["deliverySetting"]) ?? "Home",
                                unit:
                                  k === "Travel" ? "Kilometre" : k === "Report" ? "Report" : "Hour",
                                quantity: k === "Travel" ? 20 : 1,
                                frequency: k === "Report" ? "Once" : "Weekly",
                                unitPrice: 0,
                                priceItemId: k === "Travel" ? "provider-travel" : "",
                                budgetId: "",
                              },
                            ],
                          });
                        }}
                      >
                        + {k}
                      </Button>
                    ))}
                  </div>
                )
              }
            >
              {form.lines.length === 0 ? (
                <p className="px-5 py-8 text-center text-small text-ink-500">
                  No lines yet. Add a service line.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {form.lines.map((l, i) => {
                    const saved = a.lines.find((x) => x.id === l.id);
                    const item = d.priceItems.find((x) => x.id === l.priceItemId);
                    const budget = plan?.budgets.find((b) => b.id === l.budgetId);
                    const limit = item?.limit ?? null;
                    const over =
                      limit !== null &&
                      l.unitPrice > limit &&
                      budget?.management !== "Self-Managed";
                    return (
                      <li key={l.id ?? `new-${i}`} className="bubble-in px-5 py-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-full bg-accent-tint text-label font-semibold text-accent">
                            {i + 1}
                          </span>
                          <span className="text-small font-semibold text-ink-900">{l.support}</span>
                          <Tag tone={l.kind === "Service" ? "available" : "neutral"}>{l.kind}</Tag>
                          {budget && <ManagementChip value={budget.management} />}
                          {over && <Tag tone="over">Above price limit</Tag>}
                          <span className="ml-auto text-small font-semibold text-ink-900">
                            {aud(lineEstimate(l, form.start, form.end))}
                          </span>
                          {editable && (
                            <Button
                              size="icon-sm"
                              variant="danger"
                              aria-label="Remove line"
                              onClick={() =>
                                update({ lines: form.lines.filter((_, j) => j !== i) })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                        {editable ? (
                          <div className="grid gap-3 md:grid-cols-6">
                            <div className="flex flex-col gap-1 md:col-span-2">
                              <span className="text-caption font-semibold text-ink-700">
                                Service request
                              </span>
                              <Select
                                aria-label="Service"
                                value={l.needId}
                                onChange={(e) => {
                                  const n = d.needs.find((x) => x.id === e.target.value);
                                  setLine(i, {
                                    needId: e.target.value,
                                    support: n?.support ?? l.support,
                                  });
                                }}
                              >
                                {d.needs.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.support}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-caption font-semibold text-ink-700">
                                Setting
                              </span>
                              <Select
                                aria-label="Setting"
                                value={l.deliverySetting}
                                onChange={(e) =>
                                  setLine(i, {
                                    deliverySetting: e.target.value as LineInput["deliverySetting"],
                                  })
                                }
                              >
                                {deliverySettings.map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-caption font-semibold text-ink-700">Unit</span>
                              <Select
                                aria-label="Unit"
                                value={l.unit}
                                onChange={(e) =>
                                  setLine(i, { unit: e.target.value as LineInput["unit"] })
                                }
                              >
                                {serviceUnits.map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </Select>
                            </div>
                            <TextField
                              label="Quantity"
                              value={String(l.quantity)}
                              onChange={(v) =>
                                setLine(i, { quantity: Math.max(0, Number(v) || 0) })
                              }
                            />
                            <div className="flex flex-col gap-1">
                              <span className="text-caption font-semibold text-ink-700">
                                Frequency
                              </span>
                              <Select
                                aria-label="Frequency"
                                value={l.frequency}
                                onChange={(e) =>
                                  setLine(i, {
                                    frequency: e.target.value as LineInput["frequency"],
                                  })
                                }
                              >
                                {lineFrequencies.map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1 md:col-span-3">
                              <span className="text-caption font-semibold text-ink-700">
                                Support item (price source)
                              </span>
                              <Select
                                aria-label="Support item"
                                value={l.priceItemId}
                                onChange={(e) => {
                                  const it = d.priceItems.find((x) => x.id === e.target.value);
                                  setLine(i, {
                                    priceItemId: e.target.value,
                                    unitPrice: it?.limit ?? l.unitPrice,
                                    unit: (it?.unit as LineInput["unit"]) ?? l.unit,
                                  });
                                }}
                              >
                                <option value="">No item</option>
                                {d.priceItems.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                    {x.active ? "" : " (inactive)"}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1 md:col-span-2">
                              <span className="text-caption font-semibold text-ink-700">
                                Budget
                              </span>
                              <Select
                                aria-label="Budget"
                                value={l.budgetId}
                                onChange={(e) => setLine(i, { budgetId: e.target.value })}
                              >
                                <option value="">No budget</option>
                                {plan?.budgets.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name} · {b.management}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <TextField
                              label="Unit price (AUD)"
                              value={String(l.unitPrice)}
                              onChange={(v) =>
                                setLine(i, { unitPrice: Math.max(0, Number(v) || 0) })
                              }
                            />
                            <div className="md:col-span-6">
                              <TextArea
                                label="Scope and deliverables"
                                value={l.scope}
                                onChange={(v) => setLine(i, { scope: v })}
                                rows={2}
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-small text-ink-700">
                            {l.quantity} {l.unit.toLowerCase()}
                            {l.quantity === 1 ? "" : "s"} · {l.frequency} · {l.deliverySetting} ·{" "}
                            {aud(l.unitPrice)} per unit
                            <span className="block text-caption text-ink-500">{l.scope}</span>
                          </p>
                        )}
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-500">
                          <span>
                            About {occurrences(l.frequency, form.start, form.end)} occurrence
                            {occurrences(l.frequency, form.start, form.end) === 1 ? "" : "s"}
                          </span>
                          <span>
                            Price source:{" "}
                            {item
                              ? `${item.edition}, effective ${dayLabel(item.effectiveFrom)}`
                              : "none"}
                            {item && !item.code && " · item number to confirm"}
                          </span>
                          <span>Limit: {limit === null ? "none set" : aud(limit)}</span>
                          <span className="font-semibold text-ink-700">
                            →{" "}
                            {saved?.payerRoute ??
                              (budget
                                ? `${budget.management}: ${budget.payer}`
                                : "Payer to confirm")}
                          </span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FCard>

            <FCard
              icon={FilePen}
              title="Terms"
              sub="Approved content blocks and participant-readable cancellation terms"
            >
              <div className="flex flex-col gap-4">
                {editable ? (
                  <TextArea
                    label="Cancellation and notice"
                    value={form.cancellation}
                    onChange={(v) => update({ cancellation: v })}
                    rows={4}
                    required
                  />
                ) : (
                  <ReadOnly label="Cancellation and notice" value={a.cancellation} />
                )}
                <div>
                  <p className="mb-1.5 text-caption font-semibold text-ink-700">
                    Rights and responsibilities included
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {d.rightsBlocks.map((r) => {
                      const on = form.rights.includes(r.key);
                      return (
                        <button
                          key={r.key}
                          type="button"
                          disabled={!editable}
                          aria-pressed={on}
                          onClick={() =>
                            update({
                              rights: on
                                ? form.rights.filter((x) => x !== r.key)
                                : [...form.rights, r.key],
                            })
                          }
                          className={cn(
                            "flex items-start gap-2 rounded-control border px-3 py-2.5 text-left text-small transition-colors",
                            on ? "border-accent bg-accent-tint" : "border-border bg-surface",
                            editable && "cursor-pointer hover:border-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-4 flex-none items-center justify-center rounded-[4px] border",
                              on
                                ? "border-accent-fill bg-accent-fill text-on-accent"
                                : "border-border-strong",
                            )}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <span>
                            <span className="block font-semibold text-ink-900">{r.title}</span>
                            <span className="line-clamp-2 text-caption text-ink-500">{r.text}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-caption font-semibold text-ink-700">
                    Communication needs
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {communicationNeeds.map((c) => {
                      const on = form.communication.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          disabled={!editable}
                          aria-pressed={on}
                          onClick={() =>
                            update({
                              communication: on
                                ? form.communication.filter((x) => x !== c)
                                : [...form.communication, c],
                            })
                          }
                          className={cn(
                            "h-7 rounded-tag border px-2.5 text-caption font-semibold",
                            on
                              ? "border-accent-fill bg-accent-tint text-accent"
                              : "border-border-strong text-ink-700",
                            editable && "cursor-pointer",
                          )}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {editable ? (
                  <Choice
                    label="How it's shared"
                    options={sharingMethods}
                    value={form.sharing}
                    onChange={(v) => update({ sharing: v })}
                    hint="Only the final approved version is issued"
                  />
                ) : (
                  <ReadOnly label="Shared by" value={a.sharing} />
                )}
                {editable && (
                  <TextField
                    label="Note for this save (optional)"
                    value={form.reason}
                    onChange={(v) => update({ reason: v })}
                  />
                )}
              </div>
            </FCard>
          </div>

          <aside className="flex flex-col gap-6 xl:sticky xl:top-[calc(var(--topbar-h)+4.5rem)] xl:col-span-4 xl:self-start">
            <FCard icon={Send} title="Actions">
              <div className="flex flex-col gap-2">
                {editable && (
                  <Button
                    variant={dirty ? "primary" : "secondary"}
                    disabled={busy || !dirty}
                    onClick={save}
                  >
                    {busy ? "Saving…" : dirty ? "Save draft" : "Draft saved"}
                  </Button>
                )}
                {a.status === "Draft" && d.can.edit && a.review.required && !a.review.by && (
                  <Button
                    variant="soft"
                    disabled={dirty}
                    onClick={async () =>
                      (await act(a.id, { type: "submit-review" }, "Sent for internal review")) &&
                      reload()
                    }
                  >
                    Send for internal review
                  </Button>
                )}
                {a.status === "Internal Review" && (
                  <Button
                    variant="primary"
                    disabled={!d.can.verify}
                    title={d.can.verify ? undefined : "Finance approves the review"}
                    onClick={() => setSheet("review")}
                  >
                    Review this agreement
                  </Button>
                )}
                {a.status === "Draft" && d.can.edit && (
                  <Button
                    variant="primary"
                    disabled={dirty || !a.signatory.verified || (a.review.required && !a.review.by)}
                    title={
                      dirty
                        ? "Save first"
                        : !a.signatory.verified
                          ? "Verify the signatory first"
                          : a.review.required && !a.review.by
                            ? "Needs internal review approval"
                            : undefined
                    }
                    onClick={async () => {
                      const res = await act(
                        a.id,
                        { type: "issue" },
                        "Agreement issued",
                        "The signatory can review and accept through the secure link.",
                      );
                      if (res) {
                        setLink(res.link ?? null);
                        reload();
                      }
                    }}
                  >
                    <Send className="size-4" aria-hidden="true" /> Issue for acceptance
                  </Button>
                )}
                {(a.status === "Issued" || a.status === "Viewed") && d.can.edit && (
                  <Button
                    variant="soft"
                    onClick={async () => {
                      const res = await act(
                        a.id,
                        { type: "resend" },
                        "Reminder link created",
                        "Consent is never assumed.",
                      );
                      if (res) {
                        setLink(res.link ?? null);
                        reload();
                      }
                    }}
                  >
                    <Link2 className="size-4" aria-hidden="true" /> New secure link
                  </Button>
                )}
                {["Signed", "Declined", "Changes Requested", "Expired"].includes(a.status) &&
                  d.can.edit && (
                    <Button variant="primary" onClick={() => setSheet("amend")}>
                      <GitBranch className="size-4" aria-hidden="true" />{" "}
                      {a.status === "Expired" ? "Renew" : "Amend"} (new version)
                    </Button>
                  )}
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await act(
                      a.id,
                      { type: "download" },
                      "Download recorded",
                      "Use the browser's print to save a PDF.",
                    );
                    setTab("preview");
                    setTimeout(() => window.print(), 300);
                  }}
                >
                  Download or print
                </Button>
                {["Draft", "Internal Review", "Issued", "Viewed"].includes(a.status) &&
                  d.can.edit && (
                    <Button variant="soft-danger" onClick={() => setSheet("cancel")}>
                      Cancel agreement
                    </Button>
                  )}
              </div>
              {link && (
                <div className="bubble-in mt-3 rounded-control border border-accent-tint bg-accent-tint/50 p-3">
                  <p className="text-caption font-semibold text-accent">
                    Secure link for {a.signatory.name}
                  </p>
                  <p className="mt-1 truncate font-mono text-caption text-ink-700">
                    {typeof window !== "undefined" ? window.location.origin : ""}
                    {link}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={async () => {
                        await navigator.clipboard.writeText(`${window.location.origin}${link}`);
                        toast("Link copied", { tone: "success" });
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden="true" /> Copy
                    </Button>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center px-2 text-caption font-semibold text-accent"
                    >
                      Open as participant
                    </a>
                  </div>
                </div>
              )}
              {a.linkActive && !link && (
                <p className="mt-3 text-caption text-ink-500">
                  A secure link is open until {dayLabel(a.linkExpires ?? "")}.
                </p>
              )}
            </FCard>

            <FCard icon={FileText} title="Estimate by payer">
              <ul className="flex flex-col gap-2">
                {[...byPayer].map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-3 text-small">
                    <span className="min-w-0 truncate text-ink-700">{k}</span>
                    <span className="font-semibold text-ink-900">{aud(v)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t border-border pt-2 text-small">
                  <span className="font-semibold text-ink-900">Total estimate</span>
                  <span className="font-semibold text-ink-900">{aud(total)}</span>
                </li>
              </ul>
              <p className="mt-2 text-caption text-ink-500">
                An estimate and cap, not actual charges.
              </p>
            </FCard>

            {(a.review.required || a.warnings.length > 0 || a.changeRequest || a.declined) && (
              <FCard icon={AlertTriangle} title="Review and warnings">
                <div className="flex flex-col gap-3 text-small">
                  {a.changeRequest && (
                    <p className="rounded-control bg-watch-bg px-3 py-2 text-ink-900">
                      <strong>Change requested:</strong> {a.changeRequest.note}
                    </p>
                  )}
                  {a.declined && (
                    <p className="rounded-control bg-over-bg px-3 py-2 text-ink-900">
                      <strong>Declined.</strong> {a.declined.reason || "No reason given."}{" "}
                      {a.declined.outcome}
                    </p>
                  )}
                  {a.review.required && (
                    <div>
                      <p className="font-semibold text-ink-900">
                        Internal review {a.review.by ? `approved by ${a.review.by}` : "required"}
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {a.review.reasons.map((r) => (
                          <li key={r} className="text-caption text-ink-700">
                            · {r}
                          </li>
                        ))}
                      </ul>
                      {a.review.note && (
                        <p className="mt-1 text-caption text-ink-500">Note: {a.review.note}</p>
                      )}
                    </div>
                  )}
                  {a.warnings.map((w) => (
                    <p key={w} className="flex items-start gap-2 text-caption text-ink-900">
                      <AlertTriangle
                        className="mt-0.5 size-3.5 flex-none text-watch"
                        aria-hidden="true"
                      />
                      {w}
                    </p>
                  ))}
                  {a.lines.some((l) => l.support === "SDA Housing Assessment") && (
                    <p className="text-caption text-ink-500">
                      SDA Housing Assessment is an assessment, not provision of SDA accommodation,
                      so a written agreement is recommended rather than mandatory.
                    </p>
                  )}
                </div>
              </FCard>
            )}
          </aside>
        </div>
      </TabPanel>

      <TabPanel id="preview" value={tab}>
        <AgreementDocument
          className="mx-auto w-full max-w-4xl"
          a={{
            ref: a.ref,
            version: a.version,
            type: a.type,
            participant: a.participant,
            provider: a.provider,
            start: a.start,
            end: a.end,
            signatory: a.signatory,
            lines: a.lines.map((l) => ({
              id: l.id,
              support: l.support,
              kind: l.kind,
              scope: l.scope,
              setting: l.deliverySetting,
              unit: l.unit,
              quantity: l.quantity,
              frequency: l.frequency,
              unitPrice: l.unitPrice,
              occurrences: l.occurrences,
              estimate: l.estimate,
              paidBy: l.payerRoute.replace(": claim simulated", ""),
            })),
            total: a.total,
            cancellation: a.cancellation,
            rights: d.rightsBlocks.filter((r) => a.rights.includes(r.key)),
            communication: a.communication,
            communicationNote: a.communicationNote,
            planEnd: d.plans.find((p) => p.id === a.planId)?.end ?? null,
          }}
        />
      </TabPanel>

      <TabPanel id="history" value={tab}>
        <div className="grid items-stretch gap-6 xl:grid-cols-12">
          <FCard
            icon={GitBranch}
            title="Versions"
            sub="Signed versions are never edited; changes make a new version"
            className="xl:col-span-4"
            flush
          >
            <ol className="divide-y divide-border">
              {a.versions
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/care/funding/agreements/${v.id}`}
                      className={cn(
                        "flex items-center gap-3 px-5 py-3 hover:bg-canvas hover:no-underline",
                        v.id === a.id && "bg-accent-tint",
                      )}
                    >
                      <span className="font-mono text-small font-semibold text-ink-900">
                        v{v.version}
                      </span>
                      <span className="flex-1 text-caption text-ink-500">{v.type}</span>
                      <Tag tone={agreementTone[v.status]}>{v.status}</Tag>
                    </Link>
                  </li>
                ))}
            </ol>
          </FCard>
          <FCard
            icon={History}
            title="Agreement events"
            sub="Sent, viewed, signed, declined, changes, downloads"
            className="xl:col-span-8"
            flush
          >
            <ol className="relative mx-5 my-4 border-l border-border pl-6">
              {a.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative py-2">
                  <span
                    aria-hidden="true"
                    className="absolute top-3.5 -left-[31px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                  />
                  <p className="text-small font-semibold text-ink-900">{e.action}</p>
                  {e.note && <p className="text-caption text-ink-700">{e.note}</p>}
                  <p className="text-caption text-ink-500">
                    {e.by} ·{" "}
                    {new Date(e.at).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </FCard>
        </div>
      </TabPanel>

      {sheet === "signatory" && (
        <NoteSheet
          title="Verify signatory authority"
          intro={`Confirm ${a.signatory.name} may sign as "${a.signatory.authority}". For a minor or represented participant, check the guardian, nominee or appointment record (AT-20).`}
          label="How the authority was checked"
          cta="Mark authority verified"
          onClose={() => setSheet(null)}
          onSubmit={async (note) => {
            if (
              await act(a.id, { type: "verify-signatory", note }, "Signatory authority verified")
            ) {
              setSheet(null);
              reload();
            }
          }}
        />
      )}
      {sheet === "review" && (
        <ReviewSheet a={a} me={d.me} onClose={() => setSheet(null)} onDone={reload} />
      )}
      {sheet === "cancel" && (
        <NoteSheet
          title="Cancel this agreement"
          intro="The version stays in history. Signed versions can't be cancelled here; amend or let them expire."
          label="Reason"
          cta="Cancel agreement"
          danger
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            if (await act(a.id, { type: "cancel", reason }, "Agreement cancelled")) {
              setSheet(null);
              reload();
            }
          }}
        />
      )}
      {sheet === "amend" && (
        <AmendSheet
          a={a}
          onClose={() => setSheet(null)}
          onDone={(newId) => {
            setSheet(null);
            if (newId) router.push(`/care/funding/agreements/${newId}`);
          }}
        />
      )}
    </>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <span className="rounded-control bg-canvas px-3 py-2 text-small text-ink-900">{value}</span>
    </div>
  );
}

function NoteSheet({
  title,
  intro,
  label,
  cta,
  danger,
  onClose,
  onSubmit,
}: {
  title: string;
  intro: string;
  label: string;
  cta: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button
            variant={danger ? "soft-danger" : "primary"}
            disabled={note.trim().length < 5}
            onClick={() => onSubmit(note)}
          >
            {cta}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-small text-ink-700">{intro}</p>
      <TextArea label={label} value={note} onChange={setNote} rows={3} required />
    </Sheet>
  );
}

function ReviewSheet({
  a,
  me,
  onClose,
  onDone,
}: {
  a: AgreementDto;
  me: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const drafter = a.events.find((e) => /Draft prepared|drafted/.test(e.action))?.by;
  return (
    <Sheet
      title="Internal commercial review"
      description={`${a.ref} v${a.version} · ${aud(a.total)}`}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="soft-danger"
            disabled={note.trim().length < 3}
            onClick={async () => {
              if (
                await act(a.id, { type: "review", decision: "Return", note }, "Returned to draft")
              ) {
                onDone();
                onClose();
              }
            }}
          >
            Return with changes
          </Button>
          <Button
            variant="primary"
            disabled={note.trim().length < 3}
            onClick={async () => {
              if (
                await act(
                  a.id,
                  { type: "review", decision: "Approve", note },
                  "Review approved",
                  "It can now be issued.",
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            Approve
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1.5 rounded-control bg-watch-bg px-3 py-2.5 text-small text-ink-900">
          {a.review.reasons.map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
        {drafter === me && (
          <p className="text-caption text-over">
            You drafted this agreement. Someone else should approve it.
          </p>
        )}
        <TextArea label="Review note" value={note} onChange={setNote} rows={3} required />
      </div>
    </Sheet>
  );
}

function AmendSheet({
  a,
  onClose,
  onDone,
}: {
  a: AgreementDto;
  onClose: () => void;
  onDone: (id?: string) => void;
}) {
  const [kind, setKind] = useState<"Amendment" | "Renewal" | "Replacement">(
    a.status === "Expired" ? "Renewal" : "Amendment",
  );
  const [reason, setReason] = useState(
    a.changeRequest ? `Participant asked: ${a.changeRequest.note}` : "",
  );
  return (
    <Sheet
      title={`New version of ${a.ref}`}
      description={`Version ${a.version} stays ${a.status === "Signed" ? "signed and in force" : "in history"} until the new version is accepted.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 3}
            onClick={async () => {
              const res = await act(
                a.id,
                { type: "amend", kind, reason },
                `${kind} drafted`,
                "Edit the new version, then issue it.",
              );
              onDone(res?.agreementId);
            }}
          >
            Create version {a.version + 1}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice
          label="Type"
          options={["Amendment", "Renewal", "Replacement"] as const}
          value={kind}
          onChange={setKind}
        />
        <p className="text-caption text-ink-500">
          Changes to price, services, dates, signatory or payment terms always go in a new version.
          Services already delivered keep the earlier terms. Clinical frequency is still confirmed
          by the clinician.
        </p>
        <TextArea label="Reason" value={reason} onChange={setReason} rows={3} required />
      </div>
    </Sheet>
  );
}
