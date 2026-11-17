"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Lock,
  Pencil,
  PenLine,
  Pill,
  Plus,
  ShieldAlert,
  Stethoscope,
  WifiOff,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Signature } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import {
  allergyStates,
  answerStates,
  conditionStatuses,
  documentCategories,
  entryTypes,
  historySections,
  infoSources,
  medicationStatuses,
  medicationVerifications,
  riskOrigins,
  riskReviewStates,
  riskSeverities,
  riskTypes,
  severityTone,
  type EntryDto,
  type HistorySectionId,
  type RecordDto,
  type RiskDto,
} from "@/lib/live/records";
import { cn } from "@/lib/cn";
import { EmptyNote } from "./bits";
import { FCard, th, td } from "./funding-bits";
import { dayOnly, tableBox, tableHead, textArea, when } from "./ops-bits";
import type { Post } from "./record-page";

const opts = (list: readonly string[]) => list.map((o) => <option key={o}>{o}</option>);

function Prov({ by, at, source }: { by?: string | null; at?: string | null; source?: string }) {
  if (!by && !source) return null;
  return (
    <span className="text-caption text-ink-500">
      {source ? `${source}` : ""}
      {by ? `${source ? " · " : ""}${by}` : ""}
      {at ? `, ${dayOnly(at)}` : ""}
    </span>
  );
}

/* ------------------------------------------------------------------ CR-03 history */

export function HistoryTab({ r, post }: { r: RecordDto; post: Post }) {
  const [editing, setEditing] = useState<HistorySectionId | null>(null);
  const [sources, setSources] = useState("Referral, participant interview");
  if (!r.history) return null;
  const h = r.history;
  const recorded = historySections.filter((s) => h[s.id].state === "Recorded").length;
  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-5 shadow-lift">
        <div className="min-w-0 flex-1">
          <p className="text-section font-semibold text-ink-900">
            {recorded} of {historySections.length} sections recorded
          </p>
          <p className="text-caption text-ink-500">
            Not reported, Unknown, Not assessed and Not applicable are kept apart. A blank is never
            treated as no.
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-accent-fill"
              style={{ width: `${(recorded / historySections.length) * 100}%` }}
            />
          </div>
        </div>
        {r.historyReview ? (
          <Signature
            name={r.historyReview.by}
            when={`${when(r.historyReview.at)} · sources: ${r.historyReview.sources.join(", ")}`}
            label="History reviewed"
          />
        ) : (
          r.canWrite && (
            <div className="flex items-center gap-2">
              <input
                value={sources}
                onChange={(e) => setSources(e.target.value)}
                aria-label="Sources reviewed"
                className="h-9 w-64 rounded-control border border-border-strong px-2 text-small"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  post(
                    {
                      type: "history-reviewed",
                      sources: sources
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                    "History marked reviewed",
                    "Your name, the time and the sources are recorded",
                  )
                }
              >
                Mark history reviewed
              </Button>
            </div>
          )
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {historySections.map((s) => {
          const c = h[s.id];
          return (
            <article
              key={s.id}
              className="rounded-card border border-border bg-surface p-5 shadow-lift"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-small font-semibold text-ink-900">{s.label}</h3>
                  <p className="text-caption text-ink-500">{s.hint}</p>
                </div>
                <Tag
                  tone={
                    c.state === "Recorded"
                      ? "healthy"
                      : c.state === "Not reported"
                        ? "watch"
                        : "neutral"
                  }
                >
                  {c.state}
                </Tag>
              </div>
              {c.text ? (
                <p className="mt-3 text-small whitespace-pre-line text-ink-900">{c.text}</p>
              ) : (
                <p className="mt-3 text-small text-ink-500 italic">
                  {c.state === "Not reported"
                    ? "Nothing documented yet."
                    : c.state === "Recorded"
                      ? "Recorded without details."
                      : `Recorded as ${c.state.toLowerCase()}.`}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <Prov by={c.by} at={c.at} source={c.source} />
                {r.canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)}>
                    <Pencil className="size-3.5" aria-hidden="true" /> Update
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {editing && (
        <HistoryEditor
          section={editing}
          cur={h[editing]}
          onClose={() => setEditing(null)}
          post={post}
        />
      )}
    </>
  );
}

function HistoryEditor({
  section,
  cur,
  onClose,
  post,
}: {
  section: HistorySectionId;
  cur: NonNullable<RecordDto["history"]>[HistorySectionId];
  onClose: () => void;
  post: Post;
}) {
  const [state, setState] = useState<string>(cur.state === "Not reported" ? "Recorded" : cur.state);
  const [text, setText] = useState(cur.text);
  const [source, setSource] = useState(cur.source || "Participant");
  const def = historySections.find((s) => s.id === section);
  return (
    <Sheet
      title={def?.label ?? "History"}
      description={def?.hint}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={async () => {
            if (
              await post(
                { type: "history", section, state, text, source },
                "Saved",
                "Your name and the source are kept with it",
              )
            )
              onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What kind of answer is this?">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Answer">
            {answerStates.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={state === a}
                onClick={() => setState(a)}
                className={cn(
                  "h-8 cursor-pointer rounded-control border px-3 text-caption font-semibold",
                  state === a
                    ? "border-accent bg-accent-tint text-accent"
                    : "border-border-strong text-ink-700",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Details" hint={state === "Recorded" ? "Required" : "Optional context"}>
          <textarea
            className={cn(textArea, "min-h-36")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <Field label="Source">
          <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
            {opts(infoSources)}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ CR-04, CR-05 */

export function ConditionsTab({ r, post }: { r: RecordDto; post: Post }) {
  const [sheet, setSheet] = useState<"" | "condition" | "medication" | "allergy">("");
  return (
    <>
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={Stethoscope}
          title="Conditions"
          sub="Referral-reported and clinician-confirmed are kept apart"
          className="xl:col-span-7"
          flush
          action={
            r.canWrite && (
              <Button size="sm" onClick={() => setSheet("condition")}>
                <Plus className="size-3.5" aria-hidden="true" /> Add
              </Button>
            )
          }
        >
          <ul className="divide-y divide-border">
            {r.conditions.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-ink-900">{c.label}</span>
                  <span className="text-caption text-ink-500">
                    Onset {c.onset || "unknown"} · evidence: {c.evidence || "none recorded"} ·{" "}
                    {c.source} · {c.by}, {dayOnly(c.at)}
                  </span>
                </span>
                <Tag
                  tone={
                    c.status === "Confirmed by clinician"
                      ? "healthy"
                      : c.status === "Reported by referral"
                        ? "watch"
                        : "neutral"
                  }
                >
                  {c.status}
                </Tag>
              </li>
            ))}
            {!r.conditions.length && (
              <li className="px-5 py-6 text-small text-ink-500">
                No conditions documented. Nothing is assumed.
              </li>
            )}
          </ul>
        </FCard>
        <FCard
          icon={AlertTriangle}
          title="Allergies"
          sub="Unknown, not assessed and “no known” are different answers"
          className="xl:col-span-5"
          action={
            r.canWrite && (
              <Button size="sm" onClick={() => setSheet("allergy")}>
                <Plus className="size-3.5" aria-hidden="true" /> Add
              </Button>
            )
          }
        >
          <div className="flex items-center justify-between gap-2">
            <Tag
              tone={
                r.allergies.length
                  ? "over"
                  : r.allergyState === "No known allergies reported"
                    ? "healthy"
                    : "watch"
              }
            >
              {r.allergyState}
            </Tag>
            {r.allergyStateSource && (
              <Prov
                by={r.allergyStateSource.by}
                at={r.allergyStateSource.at}
                source={r.allergyStateSource.source}
              />
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {r.allergies.map((a) => (
              <li
                key={a.id}
                className="rounded-control border border-over bg-over-bg px-3 py-2 text-small"
              >
                <strong className="text-over">{a.substance}</strong> ·{" "}
                {a.reaction || "reaction not recorded"} · {a.severity || "severity unknown"}
                <span className="block text-caption text-ink-700">
                  {a.source} · {a.confirmed ? "clinician confirmed" : "not yet confirmed"} · {a.by}
                </span>
              </li>
            ))}
          </ul>
          {r.canWrite && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {allergyStates
                .filter((s) => s !== "Specific allergies recorded")
                .map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      post(
                        { type: "allergy-state", state: s, source: "Participant" },
                        `Allergy status: ${s}`,
                      )
                    }
                  >
                    {s}
                  </Button>
                ))}
            </div>
          )}
        </FCard>
      </div>
      <FCard
        icon={Pill}
        title="Medicines"
        sub={
          r.medicationsReadOnly
            ? "Read-only for your discipline: nursing or the Clinical Lead reconciles"
            : "Name, dose, route, source, verification and last review"
        }
        flush
        action={
          !r.medicationsReadOnly && (
            <Button size="sm" onClick={() => setSheet("medication")}>
              <Plus className="size-3.5" aria-hidden="true" /> Add
            </Button>
          )
        }
      >
        {r.medications.length ? (
          <table className="w-full text-left text-small">
            <thead className="bg-sunken text-label tracking-[0.08em] text-ink-500 uppercase">
              <tr>
                <th className={th}>Medicine</th>
                <th className={th}>Dose · route · frequency</th>
                <th className={th}>Indication</th>
                <th className={th}>Source</th>
                <th className={th}>Verification</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.medications.map((m) => (
                <tr key={m.id}>
                  <td className={cn(td, "font-semibold text-ink-900")}>{m.name}</td>
                  <td className={td}>
                    {m.strength} · {m.route} · {m.frequency}
                  </td>
                  <td className={td}>{m.indication}</td>
                  <td className={td}>
                    {m.source}
                    <span className="block text-caption text-ink-500">
                      reviewed {m.reviewedAt ? dayOnly(m.reviewedAt) : "never"}
                    </span>
                  </td>
                  <td className={td}>
                    <Tag
                      tone={
                        m.verification === "Clinician reconciled"
                          ? "healthy"
                          : m.verification === "Unverified"
                            ? "watch"
                            : "outline"
                      }
                    >
                      {m.verification}
                    </Tag>
                  </td>
                  <td className={td}>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-small text-ink-500">
            No medicines recorded. This doesn&apos;t mean none are taken.
          </p>
        )}
      </FCard>
      {sheet === "condition" && <ConditionSheet onClose={() => setSheet("")} post={post} />}
      {sheet === "medication" && <MedicationSheet onClose={() => setSheet("")} post={post} />}
      {sheet === "allergy" && <AllergySheet onClose={() => setSheet("")} post={post} />}
    </>
  );
}

function FormSheet({
  title,
  onClose,
  onSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onSave();
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Sheet>
  );
}

function ConditionSheet({ onClose, post }: { onClose: () => void; post: Post }) {
  const [v, setV] = useState({
    label: "",
    status: "Reported by referral",
    source: "Referral",
    onset: "",
    evidence: "",
  });
  return (
    <FormSheet
      title="Add condition"
      onClose={onClose}
      onSave={() => post({ type: "condition", ...v }, "Condition saved")}
    >
      <Field label="Condition">
        <input
          className={inputClass}
          value={v.label}
          onChange={(e) => setV({ ...v, label: e.target.value })}
        />
      </Field>
      <Field label="Status">
        <Select
          aria-label="Status"
          value={v.status}
          onChange={(e) => setV({ ...v, status: e.target.value })}
        >
          {opts(conditionStatuses)}
        </Select>
      </Field>
      <Field label="Source">
        <Select
          aria-label="Source"
          value={v.source}
          onChange={(e) => setV({ ...v, source: e.target.value })}
        >
          {opts(infoSources)}
        </Select>
      </Field>
      <Field label="Onset" hint="A year, an age or Unknown">
        <input
          className={inputClass}
          value={v.onset}
          onChange={(e) => setV({ ...v, onset: e.target.value })}
        />
      </Field>
      <Field label="Evidence">
        <input
          className={inputClass}
          value={v.evidence}
          onChange={(e) => setV({ ...v, evidence: e.target.value })}
        />
      </Field>
    </FormSheet>
  );
}

function MedicationSheet({ onClose, post }: { onClose: () => void; post: Post }) {
  const [v, setV] = useState({
    name: "",
    strength: "",
    route: "Oral",
    frequency: "",
    indication: "",
    status: "Current",
    verification: "Patient reported",
    source: "Participant",
  });
  return (
    <FormSheet
      title="Add medicine"
      onClose={onClose}
      onSave={() => post({ type: "medication", ...v }, "Medicine saved")}
    >
      {(["name", "strength", "route", "frequency", "indication", "source"] as const).map((k) => (
        <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
          <input
            className={inputClass}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </Field>
      ))}
      <Field label="Status">
        <Select
          aria-label="Status"
          value={v.status}
          onChange={(e) => setV({ ...v, status: e.target.value })}
        >
          {opts(medicationStatuses)}
        </Select>
      </Field>
      <Field label="Verification">
        <Select
          aria-label="Verification"
          value={v.verification}
          onChange={(e) => setV({ ...v, verification: e.target.value })}
        >
          {opts(medicationVerifications)}
        </Select>
      </Field>
    </FormSheet>
  );
}

function AllergySheet({ onClose, post }: { onClose: () => void; post: Post }) {
  const [v, setV] = useState({ substance: "", reaction: "", severity: "", source: "Participant" });
  return (
    <FormSheet
      title="Add allergy"
      onClose={onClose}
      onSave={() =>
        post(
          { type: "allergy", ...v },
          "Allergy recorded",
          "The treating clinicians are flagged to review it",
        )
      }
    >
      {(["substance", "reaction", "severity"] as const).map((k) => (
        <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
          <input
            className={inputClass}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </Field>
      ))}
      <Field label="Source">
        <Select
          aria-label="Source"
          value={v.source}
          onChange={(e) => setV({ ...v, source: e.target.value })}
        >
          {opts(infoSources)}
        </Select>
      </Field>
    </FormSheet>
  );
}

/* ------------------------------------------------------------------ CR-06 risks */

export function RisksTab({ r, post }: { r: RecordDto; post: Post }) {
  const [adding, setAdding] = useState(false);
  const [review, setReview] = useState<RiskDto | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-lift">
        <ShieldAlert className="size-5 text-over" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-small text-ink-700">
          Severity is set and reviewed by a qualified clinician, never by AI. A new high or critical
          risk opens a review task for the Clinical Lead and flags the next visit. The app is not an
          emergency service.
        </p>
        {r.canWrite && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden="true" /> Record risk
          </Button>
        )}
      </div>
      {!r.risks.length ? (
        <EmptyNote title="No risks recorded.">Unassessed is not the same as no risk.</EmptyNote>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {r.risks.map((k) => (
            <article
              key={k.id}
              className={cn(
                "rounded-card border bg-surface p-5 shadow-lift",
                k.severity === "High" || k.severity === "Critical"
                  ? "border-over"
                  : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={severityTone[k.severity]}>{k.severity}</Tag>
                <span className="text-small font-semibold text-ink-900">{k.types.join(", ")}</span>
                <Tag
                  tone={
                    k.review === "Reviewed"
                      ? "healthy"
                      : k.review === "Retired"
                        ? "neutral"
                        : "watch"
                  }
                >
                  {k.review}
                </Tag>
              </div>
              <p className="mt-3 text-small text-ink-900">{k.description}</p>
              {k.mitigation && (
                <div className="mt-3 rounded-control bg-sunken p-3 text-small">
                  <p className="text-caption font-semibold text-ink-500">Safe visit plan</p>
                  <p className="text-ink-900">{k.mitigation}</p>
                </div>
              )}
              {k.escalation && (
                <p className="mt-2 text-caption text-ink-700">Escalation: {k.escalation}</p>
              )}
              <p className="mt-3 text-caption text-ink-500">
                {k.origin} · {k.by}, {dayOnly(k.at)} · review by {k.reviewDue}
                {k.reviewer ? ` · reviewed by ${k.reviewer}` : ""} · shared as{" "}
                {k.sharing.toLowerCase()}
              </p>
              {r.canWrite && (
                <Button className="mt-3" size="sm" variant="ghost" onClick={() => setReview(k)}>
                  Review risk
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {adding && <RiskSheet onClose={() => setAdding(false)} post={post} />}
      {review && <RiskReview risk={review} onClose={() => setReview(null)} post={post} />}
    </>
  );
}

function RiskSheet({ onClose, post }: { onClose: () => void; post: Post }) {
  const [due] = useState(() => new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10));
  const [v, setV] = useState({
    types: [] as string[],
    origin: "Clinician assessment",
    severity: "Unassessed",
    description: "",
    mitigation: "",
    escalation: "Notify the Clinical Lead",
    reviewDue: due,
    sharing: "Operational safety summary",
  });
  return (
    <FormSheet
      title="Record risk"
      onClose={onClose}
      onSave={() =>
        post(
          { type: "risk", ...v },
          "Risk recorded",
          v.severity === "High" || v.severity === "Critical"
            ? "A review task went to the Clinical Lead"
            : undefined,
        )
      }
    >
      <Field label="Risk type (choose all that apply)">
        <div className="flex flex-wrap gap-1.5">
          {riskTypes.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={v.types.includes(t)}
              onClick={() =>
                setV({
                  ...v,
                  types: v.types.includes(t) ? v.types.filter((x) => x !== t) : [...v.types, t],
                })
              }
              className={cn(
                "h-8 cursor-pointer rounded-control border px-2.5 text-caption font-semibold",
                v.types.includes(t)
                  ? "border-accent bg-accent-tint text-accent"
                  : "border-border-strong text-ink-700",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Origin">
        <Select
          aria-label="Origin"
          value={v.origin}
          onChange={(e) => setV({ ...v, origin: e.target.value })}
        >
          {opts(riskOrigins)}
        </Select>
      </Field>
      <Field label="Severity" hint="Set by you as the qualified clinician">
        <Select
          aria-label="Severity"
          value={v.severity}
          onChange={(e) => setV({ ...v, severity: e.target.value })}
        >
          {opts(riskSeverities)}
        </Select>
      </Field>
      <Field label="Description and triggers">
        <textarea
          className={textArea}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </Field>
      <Field label="Safe visit plan">
        <textarea
          className={textArea}
          value={v.mitigation}
          onChange={(e) => setV({ ...v, mitigation: e.target.value })}
        />
      </Field>
      <Field label="Escalation">
        <input
          className={inputClass}
          value={v.escalation}
          onChange={(e) => setV({ ...v, escalation: e.target.value })}
        />
      </Field>
      <Field label="Review by">
        <input
          type="date"
          className={inputClass}
          value={v.reviewDue}
          onChange={(e) => setV({ ...v, reviewDue: e.target.value })}
        />
      </Field>
      <Field label="Who sees it">
        <Select
          aria-label="Sharing"
          value={v.sharing}
          onChange={(e) => setV({ ...v, sharing: e.target.value })}
        >
          <option>Operational safety summary</option>
          <option>Relevant staff only</option>
        </Select>
      </Field>
    </FormSheet>
  );
}

function RiskReview({ risk, onClose, post }: { risk: RiskDto; onClose: () => void; post: Post }) {
  const [state, setState] = useState<string>("Reviewed");
  const [note, setNote] = useState("");
  return (
    <FormSheet
      title="Review risk"
      onClose={onClose}
      onSave={() => post({ type: "risk-review", id: risk.id, state, note }, "Risk reviewed")}
    >
      <p className="text-small text-ink-700">{risk.description}</p>
      <Field label="Review outcome">
        <Select aria-label="Outcome" value={state} onChange={(e) => setState(e.target.value)}>
          {opts(riskReviewStates)}
        </Select>
      </Field>
      <Field label="Note">
        <textarea className={textArea} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormSheet>
  );
}

/* ------------------------------------------------------------------ CR-11 entries */

export function EntriesTab({ r, post }: { r: RecordDto; post: Post }) {
  const [editing, setEditing] = useState<EntryDto | "new" | null>(null);
  const [addendum, setAddendum] = useState<EntryDto | null>(null);
  const [filter, setFilter] = useState<"all" | "Draft" | "Signed">("all");
  const list = r.entries.filter((e) => filter === "all" || e.status === filter);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        {(["all", "Draft", "Signed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-8 cursor-pointer rounded-control px-3 text-small",
              filter === f
                ? "bg-accent-tint font-semibold text-accent"
                : "text-ink-700 hover:bg-canvas",
            )}
          >
            {f === "all" ? "All" : f === "Draft" ? "Drafts" : "Signed"} ·{" "}
            {r.entries.filter((e) => f === "all" || e.status === f).length}
          </button>
        ))}
        <span className="ml-auto text-caption text-ink-500">
          Signed entries change only by a dated addendum. Voiding keeps the entry in history.
        </span>
        {r.canWrite && (
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <PenLine className="size-3.5" aria-hidden="true" /> New entry
          </Button>
        )}
      </div>
      {!list.length ? (
        <EmptyNote title="No entries here yet." />
      ) : (
        <div className="flex h-[680px] flex-col gap-4 overflow-y-auto pr-1">
          {list.map((e) => (
            <article
              key={e.id}
              className={cn(
                "rounded-card border bg-surface p-5 shadow-lift",
                e.status === "Draft" ? "border-dashed border-border-strong" : "border-border",
                e.status === "Voided" && "opacity-70",
              )}
            >
              <header className="flex flex-wrap items-center gap-2">
                <Tag
                  tone={
                    e.status === "Signed" ? "healthy" : e.status === "Draft" ? "watch" : "neutral"
                  }
                >
                  {e.status}
                </Tag>
                <span className="text-small font-semibold text-ink-900">{e.title}</span>
                {e.restricted && (
                  <span className="inline-flex items-center gap-1 rounded-tag border border-border-strong px-1.5 text-label font-semibold text-ink-700">
                    <Lock className="size-3" aria-hidden="true" /> {e.discipline}
                  </span>
                )}
                {e.offline && (
                  <span className="inline-flex items-center gap-1 rounded-tag bg-watch-bg px-1.5 text-label font-semibold text-watch">
                    <WifiOff className="size-3" aria-hidden="true" /> Saved offline · not synced
                  </span>
                )}
                <span className="ml-auto text-caption text-ink-500">
                  {e.type} · {e.episodeLabel}
                </span>
              </header>
              {e.hidden ? (
                <p className="mt-3 flex items-center gap-2 rounded-control bg-sunken px-3 py-2 text-small text-ink-700">
                  <Lock className="size-4 text-ink-500" aria-hidden="true" /> Restricted{" "}
                  {e.discipline} content. Only that discipline&apos;s treating clinician, or someone
                  with recorded consent and approval, can read it.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-small whitespace-pre-line text-ink-900">
                    {e.text || <em className="text-ink-500">Empty draft</em>}
                  </p>
                  <p className="mt-2 text-caption text-ink-500">Informant: {e.informant}</p>
                  {e.missing.length > 0 && (
                    <p className="mt-2 rounded-control border border-watch bg-watch-bg px-3 py-2 text-caption text-watch">
                      Incomplete, to finish at the next visit: {e.missing.join(" · ")}
                    </p>
                  )}
                  {e.addenda.map((a, i) => (
                    <div key={i} className="mt-3 border-l-2 border-watch-dot pl-3">
                      <p className="text-caption font-semibold text-ink-700">
                        Addendum · {a.by}, {when(a.at)} · {a.reason}
                      </p>
                      <p className="text-small text-ink-900">{a.text}</p>
                    </div>
                  ))}
                </>
              )}
              {e.voided && (
                <p className="mt-2 text-caption text-over">
                  Voided by {e.voided.by}, {when(e.voided.at)}: {e.voided.reason}
                </p>
              )}
              <footer className="mt-4 flex flex-wrap items-center gap-2">
                {e.signedAt ? (
                  <Signature name={e.author} when={when(e.signedAt)} />
                ) : (
                  <span className="text-caption text-ink-500">
                    Draft by {e.author}, {when(e.createdAt)}
                  </span>
                )}
                {!e.hidden && r.canWrite && (
                  <span className="ml-auto flex gap-2">
                    {e.status === "Draft" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                          Edit draft
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={e.missing.length > 0 || !e.text.trim()}
                          onClick={() =>
                            post(
                              { type: "sign", id: e.id },
                              "Signed",
                              "Locked; changes now need an addendum",
                            )
                          }
                        >
                          <CheckCircle2 className="size-3.5" aria-hidden="true" /> Sign
                        </Button>
                      </>
                    )}
                    {e.status === "Signed" && (
                      <Button size="sm" variant="ghost" onClick={() => setAddendum(e)}>
                        Add addendum
                      </Button>
                    )}
                  </span>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <EntrySheet
          r={r}
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          post={post}
        />
      )}
      {addendum && <AddendumSheet entry={addendum} onClose={() => setAddendum(null)} post={post} />}
    </>
  );
}

function EntrySheet({
  r,
  entry,
  onClose,
  post,
}: {
  r: RecordDto;
  entry: EntryDto | null;
  onClose: () => void;
  post: Post;
}) {
  const mine = r.episodes.filter((e) => e.mine);
  const [v, setV] = useState({
    entryType: entry?.type ?? "Clinical observation",
    episodeId: entry?.episodeId ?? mine[0]?.id ?? r.episodes[0]?.id ?? null,
    title: entry?.title ?? "",
    text: entry?.text ?? "",
    informant: entry?.informant ?? "Clinician observation",
    missing: (entry?.missing ?? []).join("\n"),
  });
  return (
    <FormSheet
      title={entry ? "Edit draft" : "New clinical entry"}
      onClose={onClose}
      onSave={() =>
        post(
          {
            type: "entry",
            id: entry?.id,
            ...v,
            missing: v.missing
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            offline: false,
          },
          "Draft saved",
          "Sign it when it's complete",
        )
      }
    >
      <Field label="Entry type">
        <Select
          aria-label="Entry type"
          value={v.entryType}
          onChange={(e) => setV({ ...v, entryType: e.target.value as typeof v.entryType })}
        >
          {opts(entryTypes)}
        </Select>
      </Field>
      <Field label="Episode">
        <Select
          aria-label="Episode"
          value={v.episodeId ?? ""}
          onChange={(e) => setV({ ...v, episodeId: e.target.value || null })}
        >
          {r.episodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.support} · {e.clinician ?? "unassigned"}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title">
        <input
          className={inputClass}
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
        />
      </Field>
      <Field
        label="Who is this information from?"
        hint="Teacher and carer reports stay separate from what you observed"
      >
        <Select
          aria-label="Informant"
          value={v.informant}
          onChange={(e) => setV({ ...v, informant: e.target.value as typeof v.informant })}
        >
          {opts(["Clinician observation", "Participant report", "Carer report", "Teacher report"])}
        </Select>
      </Field>
      <Field label="Entry">
        <textarea
          className={cn(textArea, "min-h-40")}
          value={v.text}
          onChange={(e) => setV({ ...v, text: e.target.value })}
        />
      </Field>
      <Field
        label="Still to complete (one per line)"
        hint="An entry with open items saves as a draft and can't be signed yet"
      >
        <textarea
          className={textArea}
          value={v.missing}
          onChange={(e) => setV({ ...v, missing: e.target.value })}
        />
      </Field>
    </FormSheet>
  );
}

function AddendumSheet({
  entry,
  onClose,
  post,
}: {
  entry: EntryDto;
  onClose: () => void;
  post: Post;
}) {
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  return (
    <FormSheet
      title="Add addendum"
      onClose={onClose}
      onSave={() =>
        post(
          { type: "addendum", id: entry.id, text, reason },
          "Addendum added",
          "The signed original is unchanged",
        )
      }
    >
      <p className="rounded-control bg-sunken p-3 text-small text-ink-700">{entry.text}</p>
      <Field label="Reason">
        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Addendum">
        <textarea className={textArea} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </FormSheet>
  );
}

/* ------------------------------------------------------------------ CR-09 documents */

export function DocumentsTab({ r, post }: { r: RecordDto; post: Post }) {
  const [share, setShare] = useState<RecordDto["documents"][number] | null>(null);
  const [classify, setClassify] = useState<RecordDto["documents"][number] | null>(null);
  if (!r.documents.length)
    return (
      <EmptyNote title="No documents on this record yet.">
        Referral documents and uploads appear here with their source and review state.
      </EmptyNote>
    );
  return (
    <>
      <div className={tableBox}>
        <table className="w-full text-left text-small">
          <thead className={tableHead}>
            <tr>
              <th className={th}>Document</th>
              <th className={th}>Category</th>
              <th className={th}>Source · author</th>
              <th className={th}>Review</th>
              <th className={th}>Shared with</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.documents.map((d) => (
              <tr key={d.id} className="hover:bg-canvas">
                <td className={td}>
                  <span className="flex items-center gap-2 font-semibold text-ink-900">
                    {d.hidden ? (
                      <Lock className="size-3.5 text-ink-500" aria-hidden="true" />
                    ) : (
                      <FileText className="size-3.5 text-ink-500" aria-hidden="true" />
                    )}
                    {d.href ? (
                      <a
                        href={d.href}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-accent"
                      >
                        {d.name}
                      </a>
                    ) : (
                      d.name
                    )}
                  </span>
                  <span className="text-caption text-ink-500">
                    v{d.version} · received {dayOnly(d.receivedAt)}
                    {d.restricted ? " · restricted" : ""}
                  </span>
                </td>
                <td className={td}>{d.category}</td>
                <td className={td}>
                  {d.source}
                  <span className="block text-caption text-ink-500">{d.author}</span>
                </td>
                <td className={td}>
                  {d.reviewedBy ? (
                    <Tag tone="healthy">Reviewed · {d.reviewedBy}</Tag>
                  ) : (
                    <Tag tone="watch">Not reviewed</Tag>
                  )}
                </td>
                <td className={td}>
                  {d.shares.length ? (
                    d.shares.map((s) => (
                      <span key={s.recipient} className="block text-caption">
                        {s.recipient}{" "}
                        {s.revoked ? (
                          <span className="text-over">· revoked</span>
                        ) : s.expires ? (
                          `· until ${s.expires}`
                        ) : (
                          ""
                        )}
                        {!s.revoked && !d.hidden && (
                          <button
                            type="button"
                            className="ml-2 cursor-pointer font-semibold text-accent"
                            onClick={() =>
                              post(
                                { type: "revoke", documentId: d.id, recipient: s.recipient },
                                "Sharing revoked",
                                "No new access; history kept",
                              )
                            }
                          >
                            Revoke
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="text-caption text-ink-500">Not shared</span>
                  )}
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {!d.hidden && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setClassify(d)}>
                        Classify
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShare(d)}>
                        Share
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {classify && (
        <ClassifySheet r={r} doc={classify} onClose={() => setClassify(null)} post={post} />
      )}
      {share && <ShareSheet r={r} doc={share} onClose={() => setShare(null)} post={post} />}
    </>
  );
}

function ClassifySheet({
  r,
  doc,
  onClose,
  post,
}: {
  r: RecordDto;
  doc: RecordDto["documents"][number];
  onClose: () => void;
  post: Post;
}) {
  const [v, setV] = useState({
    category: doc.category,
    episodeId: doc.episodeId,
    restricted: doc.restricted,
    reviewed: Boolean(doc.reviewedBy),
  });
  return (
    <FormSheet
      title="Classify document"
      onClose={onClose}
      onSave={() => post({ type: "document", documentId: doc.id, ...v }, "Document updated")}
    >
      <p className="text-small text-ink-700">{doc.name}</p>
      <Field label="Category">
        <Select
          aria-label="Category"
          value={v.category}
          onChange={(e) => setV({ ...v, category: e.target.value })}
        >
          {opts(documentCategories)}
        </Select>
      </Field>
      <Field label="Episode">
        <Select
          aria-label="Episode"
          value={v.episodeId ?? ""}
          onChange={(e) => setV({ ...v, episodeId: e.target.value || null })}
        >
          <option value="">Whole record</option>
          {r.episodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.support}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-small text-ink-900">
        <input
          type="checkbox"
          checked={v.restricted}
          onChange={(e) => setV({ ...v, restricted: e.target.checked })}
        />{" "}
        Restricted: hide the file and its name from non-clinical roles
      </label>
      <label className="flex items-center gap-2 text-small text-ink-900">
        <input
          type="checkbox"
          checked={v.reviewed}
          onChange={(e) => setV({ ...v, reviewed: e.target.checked })}
        />{" "}
        Clinically reviewed by me
      </label>
    </FormSheet>
  );
}

function ShareSheet({
  r,
  doc,
  onClose,
  post,
}: {
  r: RecordDto;
  doc: RecordDto["documents"][number];
  onClose: () => void;
  post: Post;
}) {
  const recipients = r.careTeam.contacts;
  const [recipient, setRecipient] = useState(recipients[0]?.name ?? "");
  const [expires, setExpires] = useState("");
  const consent = r.consents.find((c) => c.key === "share-coordinator");
  return (
    <FormSheet
      title="Share document"
      onClose={onClose}
      onSave={() =>
        post(
          { type: "share", documentId: doc.id, recipient, expires: expires || null },
          "Shared",
          "Consent and recipient authority were checked",
        )
      }
    >
      <p className="text-small text-ink-700">{doc.name}</p>
      <p
        className={cn(
          "rounded-control px-3 py-2 text-caption",
          consent?.state === "Given" ? "bg-healthy-bg text-healthy" : "bg-over-bg text-over",
        )}
      >
        Information-sharing consent: {consent?.state ?? "Not asked"}
        {consent?.note ? ` · ${consent.note}` : ""}
      </p>
      <Field label="Recipient" hint="Verified, authorised contacts only">
        <Select
          aria-label="Recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        >
          {recipients.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} · {c.role}
              {c.verified ? "" : " (unverified)"}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Access ends" hint="Optional">
        <input
          type="date"
          className={inputClass}
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
      </Field>
    </FormSheet>
  );
}
