"use client";

import { ArrowLeft, FlaskConical, History, Plus, Repeat, Trash2, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  actionOwners,
  actionTypes,
  approvalRequirements,
  conditionFields,
  delayKinds,
  duplicatePolicies,
  operators,
  ruleScopes,
  runModes,
  teams,
  templates,
  triggerEvents,
  unsafeRule,
  type ApprovalDto,
  type OpsCan,
  type OpsHubDto,
  type RuleDto,
  type RuleInput,
  type RunDto,
} from "@/lib/live/operations";
import { cn } from "@/lib/cn";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, th, td } from "./funding-bits";
import {
  approvalTone,
  ops,
  outcomeTone,
  ruleTone,
  textArea,
  when,
  tableBox,
  tableHead,
  TableFoot,
} from "./ops-bits";

/* ------------------------------------------------------------------ catalogue (OP-04) */

export function RulesTab({ hub }: { hub: OpsHubDto }) {
  const [status, setStatus] = useState("");
  const rows = hub.rules.filter((r) => !status || r.status === status);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        {["", "Active", "Paused", "Draft", "Archived"].map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "h-8 cursor-pointer rounded-control px-3 text-small",
              status === s
                ? "bg-accent-tint font-semibold text-accent"
                : "text-ink-700 hover:bg-canvas",
            )}
          >
            {s || "All"} · {hub.rules.filter((r) => !s || r.status === s).length}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-caption text-ink-500">
            Rules run deterministic steps. They never make clinical decisions.
          </span>
          {hub.can.manager && (
            <ButtonLink size="sm" variant="primary" href="/care/operations/rules/new">
              <Plus className="size-3.5" aria-hidden="true" /> New rule
            </ButtonLink>
          )}
        </span>
      </div>
      <div className={tableBox}>
        <table className="w-full text-left text-small">
          <thead className={tableHead}>
            <tr>
              <th className={th}>Rule</th>
              <th className={th}>Trigger · check</th>
              <th className={th}>Action · owner</th>
              <th className={th}>Run mode</th>
              <th className={th}>Version</th>
              <th className={th}>Activity</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <td className={cn(td, "max-w-80")}>
                  <a
                    href={`/care/operations/rules/${r.id}`}
                    className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                  >
                    <span className="mr-2 font-mono text-caption text-ink-500">{r.code}</span>
                    {r.name}
                  </a>
                  <span className="mt-0.5 line-clamp-2 block text-caption text-ink-500">
                    {r.description}
                  </span>
                </td>
                <td className={td}>
                  <span className="block font-mono text-caption text-ink-700">{r.trigger}</span>
                  <span className="text-caption text-ink-500">{r.check}</span>
                </td>
                <td className={td}>
                  <span className="block">{r.proposedAction}</span>
                  <span className="text-caption text-ink-500">{r.defaultOwnerLabel}</span>
                </td>
                <td className={td}>
                  <span className="block">{r.runMode}</span>
                  <span className="text-caption text-ink-500">Approval: {r.approval}</span>
                </td>
                <td className={td}>v{r.version}</td>
                <td className={td}>
                  <span className="block">{r.created} created</span>
                  <span className="text-caption text-ink-500">
                    {r.lastRun ? `last ${when(r.lastRun)}` : "no runs yet"}
                  </span>
                </td>
                <td className={td}>
                  <Tag tone={ruleTone[r.status]}>{r.status}</Tag>
                  {r.pendingApproval && (
                    <span className="mt-1 block text-caption text-watch">Activation pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ run log (OP-10) */

export function RunLogTab({ hub, onDone }: { hub: OpsHubDto; onDone: () => void }) {
  const [rule, setRule] = useState("");
  const [outcome, setOutcome] = useState("");
  const [replayKey, setReplayKey] = useState("");
  const rows = hub.runs.filter(
    (r) => (!rule || r.ruleCode === rule) && (!outcome || r.outcome === outcome),
  );
  const replayable = hub.tasks
    .filter((t) => t.source === "Rule" && t.ruleCode && t.ruleCode !== "AUT-16")
    .slice(0, 30);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-60">
          <Select
            aria-label="Rule"
            className="h-9"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          >
            <option value="">All rules</option>
            {hub.rules.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label="Outcome"
            className="h-9"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All outcomes</option>
            {Object.keys(outcomeTone).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-500">Test idempotency: send an event again</span>
          <div className="w-80">
            <Select
              aria-label="Event to replay"
              className="h-9"
              value={replayKey}
              onChange={(e) => setReplayKey(e.target.value)}
            >
              <option value="">Choose a rule-created task</option>
              {replayable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ruleCode} · {t.ref} · {t.related.ref}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!replayKey}
            onClick={async () => {
              const res = await ops<{ outcome: string; detail: string }>(
                "/api/care/operations",
                { type: "replay", taskId: replayKey },
                "Event replayed",
                "Logged below as a skipped duplicate",
              );
              if (res) onDone();
            }}
          >
            <Repeat className="size-3.5" aria-hidden="true" /> Replay event
          </Button>
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyNote title="No runs match." />
      ) : (
        <div className={tableBox}>
          <table className="w-full text-left text-small">
            <thead className={tableHead}>
              <tr>
                <th className={th}>Run</th>
                <th className={th}>Rule · version</th>
                <th className={th}>Trigger · input</th>
                <th className={th}>Actions</th>
                <th className={th}>Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <RunRow key={r.id} r={r} onDone={onDone} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <TableFoot shown={rows.length} total={hub.runs.length} noun="rule runs" />
      )}
    </>
  );
}

function RunRow({ r, onDone }: { r: RunDto; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <tr className="align-top hover:bg-canvas">
      <td className={td}>
        <span className="block font-mono text-caption text-ink-700">{r.ref}</span>
        <span className="text-caption text-ink-500">{when(r.at)}</span>
      </td>
      <td className={td}>
        <span className="block">
          <span className="font-mono text-caption">{r.ruleCode}</span> v{r.ruleVersion}
        </span>
        <span className="text-caption text-ink-500">{r.mode}</span>
      </td>
      <td className={cn(td, "max-w-72")}>
        <span className="block font-mono text-caption text-ink-700">{r.trigger}</span>
        <span className="block text-caption text-ink-900">{r.entity}</span>
        <span className="block text-caption text-ink-500">{r.input}</span>
      </td>
      <td className={cn(td, "max-w-72 text-caption text-ink-700")}>
        {r.actions.join(" · ") || "—"}
      </td>
      <td className={cn(td, "max-w-80")}>
        <Tag tone={outcomeTone[r.outcome]}>{r.outcome}</Tag>
        <span className="mt-1 block text-caption text-ink-500">{r.detail}</span>
        {r.outcome === "Error" && !r.resolved && (
          <span className="mt-2 flex gap-2">
            <Button
              size="sm"
              loading={busy}
              disabled={r.retries >= 3}
              onClick={async () => {
                setBusy(true);
                if (await ops(`/api/care/operations/runs/${r.id}`, { skip: false }, "Retried"))
                  onDone();
                setBusy(false);
              }}
            >
              Retry ({r.retries}/3)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (await ops(`/api/care/operations/runs/${r.id}`, { skip: true }, "Skipped"))
                  onDone();
              }}
            >
              Skip
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ rule builder (OP-05) */

type Detail = {
  rule: RuleDto;
  snapshots: { version: number; snapshot: RuleInput }[];
  runs: RunDto[];
  approvals: ApprovalDto[];
  can: OpsCan;
};

const blankRule: RuleInput = {
  name: "",
  description: "",
  trigger: "ReferralSubmitted",
  scope: "Organisation",
  scopeValue: "",
  join: "AND",
  conditions: [],
  action: "Create Task",
  owner: "Team",
  team: "Intake",
  delayKind: "Immediately",
  delayValue: 0,
  escalateAfterHours: 24,
  escalateTo: "Operations",
  exclusions: "",
  runMode: "Suggest Only",
  approval: "Never",
  approvalRuns: 0,
  duplicatePolicy: "Skip Existing",
  quietStart: "20:00",
  quietEnd: "07:30",
  messageTemplate: "",
  messageChannel: "",
  changeReason: "",
};

export function RuleBuilderPage({ id }: { id: string }) {
  const isNew = id === "new";
  const { data, error, loading, reload } = useResource<Detail>(
    isNew ? null : `/api/care/operations/rules/${id}`,
  );
  if (!isNew && error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!isNew && (loading || !data)) return <Skeleton className="h-[640px]" />;
  return <Builder key={data?.rule.version ?? 0} detail={data} isNew={isNew} reload={reload} />;
}

function Builder({
  detail,
  isNew,
  reload,
}: {
  detail: Detail | null;
  isNew: boolean;
  reload: () => void;
}) {
  const r = detail?.rule;
  const {
    name,
    description,
    trigger,
    scope,
    scopeValue,
    join,
    conditions,
    action,
    owner,
    team,
    delayKind,
    delayValue,
    escalateAfterHours,
    escalateTo,
    exclusions,
    runMode,
    approval,
    approvalRuns,
    duplicatePolicy,
    quietStart,
    quietEnd,
    messageTemplate,
    messageChannel,
  } = r ?? blankRule;
  const [v, setV] = useState<RuleInput>({
    name,
    description,
    trigger,
    scope,
    scopeValue,
    join,
    conditions,
    action,
    owner,
    team,
    delayKind,
    delayValue,
    escalateAfterHours,
    escalateTo,
    exclusions,
    runMode,
    approval,
    approvalRuns,
    duplicatePolicy,
    quietStart,
    quietEnd,
    messageTemplate,
    messageChannel,
    changeReason: "",
  });
  const [busy, setBusy] = useState("");
  const [sim, setSim] = useState<{
    matches: number;
    preview: { entity: string; input: string; actions: string[] }[];
  } | null>(null);
  const [why, setWhy] = useState("");
  const router = useRouter();
  const set = (p: Partial<RuleInput>) => setV((x) => ({ ...x, ...p }));
  const problems = unsafeRule(v);
  const canEdit = isNew || Boolean(detail?.can.manager && r?.status !== "Archived");
  const messaging = ["Draft Message", "Send Approved Reminder", "Request Information"].includes(
    v.action,
  );
  const post = async (body: unknown, ok: string) => {
    setBusy(ok);
    const res = await ops<Record<string, unknown>>(
      isNew ? "/api/care/operations" : `/api/care/operations/rules/${r?.id}`,
      body,
      ok,
    );
    setBusy("");
    return res;
  };
  const save = async () => {
    const res = await post(
      isNew ? { type: "rule", rule: v } : { type: "save", rule: v },
      isNew ? "Rule created as Draft" : "New version saved",
    );
    if (res && isNew && typeof res.id === "string") router.push(`/care/operations/rules/${res.id}`);
    else if (res) reload();
  };
  const sel = (label: string, key: keyof RuleInput, list: readonly string[]) => (
    <Field label={label}>
      <Select
        aria-label={label}
        disabled={!canEdit}
        value={String(v[key])}
        onChange={(e) => set({ [key]: e.target.value } as Partial<RuleInput>)}
      >
        {list.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    </Field>
  );
  const num = (
    label: string,
    key: "delayValue" | "escalateAfterHours" | "approvalRuns",
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={0}
        disabled={!canEdit}
        className={inputClass}
        value={v[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
      />
    </Field>
  );

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href="/care/operations?tab=rules">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Rules
          </ButtonLink>
        }
        title={isNew ? "New rule" : `${r?.code} ${r?.name}`}
        description={
          r ? (
            <span className="flex items-center gap-2">
              <Tag tone={ruleTone[r.status]}>{r.status}</Tag> v{r.version} · {r.runMode}
            </span>
          ) : (
            "Starts as a Draft in Suggest Only"
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <RuleMark>Automation</RuleMark>
            <LiveBadge />
          </div>
        }
      />
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
          <FCard icon={Workflow} title="When" sub="Trigger, scope and conditions">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rule name (unique per version)">
                <input
                  className={inputClass}
                  disabled={!canEdit}
                  value={v.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              {sel("Trigger event", "trigger", triggerEvents)}
              <div className="sm:col-span-2">
                <Field label="Description">
                  <textarea
                    className={textArea}
                    disabled={!canEdit}
                    value={v.description}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                </Field>
              </div>
              {sel("Scope", "scope", ruleScopes)}
              <Field label="Scope value" hint="e.g. Occupational Therapy, Brisbane North, Intake">
                <input
                  className={inputClass}
                  disabled={!canEdit || v.scope === "Organisation"}
                  value={v.scopeValue}
                  onChange={(e) => set({ scopeValue: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-caption font-semibold text-ink-700">Conditions</span>
                <div className="w-24">
                  <Select
                    aria-label="Join"
                    className="h-8"
                    disabled={!canEdit}
                    value={v.join}
                    onChange={(e) => set({ join: e.target.value as "AND" | "OR" })}
                  >
                    <option>AND</option>
                    <option>OR</option>
                  </Select>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={v.conditions.length >= 8}
                    onClick={() =>
                      set({
                        conditions: [
                          ...v.conditions,
                          { field: "referral.status", op: "equals", value: "" },
                        ],
                      })
                    }
                  >
                    <Plus className="size-3.5" aria-hidden="true" /> Add condition
                  </Button>
                )}
              </div>
              {v.conditions.length === 0 && (
                <p className="text-caption text-ink-500">
                  No extra conditions: the rule acts on every matching trigger.
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {v.conditions.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className="w-10 text-caption text-ink-500">
                      {i === 0 ? "If" : v.join}
                    </span>
                    <div className="w-64">
                      <Select
                        aria-label="Field"
                        className="h-9"
                        disabled={!canEdit}
                        value={c.field}
                        onChange={(e) =>
                          set({
                            conditions: v.conditions.map((x, j) =>
                              j === i ? { ...x, field: e.target.value as typeof c.field } : x,
                            ),
                          })
                        }
                      >
                        {conditionFields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                            {f.sensitive ? " (clinical)" : ""}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-44">
                      <Select
                        aria-label="Operator"
                        className="h-9"
                        disabled={!canEdit}
                        value={c.op}
                        onChange={(e) =>
                          set({
                            conditions: v.conditions.map((x, j) =>
                              j === i ? { ...x, op: e.target.value as typeof c.op } : x,
                            ),
                          })
                        }
                      >
                        {operators.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </Select>
                    </div>
                    <input
                      aria-label="Value"
                      disabled={!canEdit || c.op === "exists" || c.op === "missing"}
                      value={c.value}
                      onChange={(e) =>
                        set({
                          conditions: v.conditions.map((x, j) =>
                            j === i ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                      className="h-9 min-w-40 flex-1 rounded-control border border-border-strong px-2 text-small"
                    />
                    {canEdit && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove condition"
                        onClick={() => set({ conditions: v.conditions.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </FCard>
          <FCard icon={Workflow} title="Then" sub="Action, owner, timing and escalation">
            <div className="grid gap-4 sm:grid-cols-3">
              {sel("Action", "action", actionTypes)}
              {sel("Action owner", "owner", actionOwners)}
              {sel("Team", "team", teams)}
              {messaging && (
                <>
                  <Field label="Message template">
                    <Select
                      aria-label="Message template"
                      disabled={!canEdit}
                      value={v.messageTemplate}
                      onChange={(e) => set({ messageTemplate: e.target.value })}
                    >
                      <option value="">Choose</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.category} v{t.version}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Channel">
                    <Select
                      aria-label="Channel"
                      disabled={!canEdit}
                      value={v.messageChannel}
                      onChange={(e) => set({ messageChannel: e.target.value })}
                    >
                      <option value="">Template default</option>
                      {["In-App", "Email", "SMS", "Secure Link"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <span />
                </>
              )}
              {sel("Delay", "delayKind", delayKinds)}
              {num("Delay amount", "delayValue")}
              {sel("Duplicate policy", "duplicatePolicy", duplicatePolicies)}
              {num("Escalate after (hours)", "escalateAfterHours", "Business hours")}
              {sel("Escalate to", "escalateTo", teams)}
              <Field label="Quiet hours">
                <span className="flex gap-2">
                  <input
                    type="time"
                    aria-label="Quiet hours start"
                    disabled={!canEdit}
                    value={v.quietStart}
                    onChange={(e) => set({ quietStart: e.target.value })}
                    className={inputClass}
                  />
                  <input
                    type="time"
                    aria-label="Quiet hours end"
                    disabled={!canEdit}
                    value={v.quietEnd}
                    onChange={(e) => set({ quietEnd: e.target.value })}
                    className={inputClass}
                  />
                </span>
              </Field>
              <div className="sm:col-span-3">
                <Field label="Exclusions">
                  <input
                    className={inputClass}
                    disabled={!canEdit}
                    value={v.exclusions}
                    onChange={(e) => set({ exclusions: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </FCard>
          <FCard
            icon={FlaskConical}
            title="Governance"
            sub="Run mode, approval and the reason for this version"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {sel("Run mode", "runMode", runModes)}
              {sel("Approval requirement", "approval", approvalRequirements)}
              {num("First N runs", "approvalRuns", "When approval is First N Runs")}
              <div className="sm:col-span-3">
                <Field label="Why is this changing? (recorded in the changelog)">
                  <input
                    className={inputClass}
                    disabled={!canEdit}
                    value={v.changeReason}
                    onChange={(e) => set({ changeReason: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            {problems.length > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-control border border-over bg-over-bg px-4 py-3 text-small text-over"
              >
                <p className="font-semibold">This combination can&apos;t be saved</p>
                <ul className="mt-1 list-disc pl-4">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {r && !r.builtIn && (
              <p className="mt-3 rounded-control bg-sunken px-3 py-2 text-caption text-ink-700">
                Custom rules reuse the check of the built-in rule with the same trigger. They can be
                simulated, approved and paused; executing them is switched off in this version, so
                the built-in rule stays the one that creates tasks.
              </p>
            )}
            <p className="mt-3 text-caption text-ink-500">
              Clinical-risk conditions always need an authorised clinical review. Clinical status
              changes aren&apos;t available as actions.{" "}
              {isNew
                ? "New rules start in Suggest Only."
                : "Saving a change to an active rule returns it to Draft until the new version is approved."}
            </p>
            {canEdit && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={problems.length > 0 || v.changeReason.length < 3 || v.name.length < 3}
                  loading={busy.startsWith("Rule created") || busy.startsWith("New version")}
                  onClick={save}
                >
                  {isNew ? "Create draft" : `Save as version ${(r?.version ?? 0) + 1}`}
                </Button>
                {v.changeReason.length < 3 && (
                  <span className="self-center text-caption text-ink-500">
                    Give the reason for the change to save.
                  </span>
                )}
              </div>
            )}
          </FCard>
        </div>
        {r && detail && (
          <div className="flex flex-col gap-6 xl:sticky xl:top-20 xl:col-span-4 xl:self-start">
            <FCard
              icon={FlaskConical}
              title="Simulate and activate"
              sub="Simulation never changes a record"
            >
              <div className="flex flex-col gap-3">
                <Button
                  loading={busy === "Simulated"}
                  onClick={async () => {
                    const res = await post({ type: "simulate" }, "Simulated");
                    if (res) {
                      setSim(res as unknown as typeof sim);
                      reload();
                    }
                  }}
                >
                  <FlaskConical className="size-3.5" aria-hidden="true" /> Simulate v{r.version} now
                </Button>
                {sim && (
                  <div className="rounded-control bg-sunken p-3 text-caption">
                    <p className="font-semibold text-ink-900">
                      Would act on {sim.matches} record(s). Nothing was changed.
                    </p>
                    <ul className="mt-1 flex flex-col gap-1 text-ink-700">
                      {sim.preview.slice(0, 6).map((p, i) => (
                        <li key={i}>
                          {p.entity}: {p.actions.join("; ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {detail.can.manager && r.status !== "Active" && r.status !== "Archived" && (
                  <Button
                    variant="primary"
                    disabled={r.pendingApproval}
                    loading={busy === "Activation requested"}
                    onClick={async () => {
                      if (
                        await post({ type: "request-activation", note: "" }, "Activation requested")
                      )
                        reload();
                    }}
                  >
                    {r.pendingApproval ? "Activation awaiting approval" : "Ask to activate"}
                  </Button>
                )}
                {detail.can.manager && r.status === "Active" && (
                  <>
                    <input
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      placeholder="Reason to pause"
                      aria-label="Reason to pause"
                      className="h-9 rounded-control border border-border-strong px-2 text-small"
                    />
                    <Button
                      disabled={why.length < 3}
                      loading={busy === "Paused"}
                      onClick={async () => {
                        if (await post({ type: "pause", reason: why }, "Paused")) reload();
                      }}
                    >
                      Pause rule
                    </Button>
                    <p className="text-caption text-ink-500">
                      Pausing keeps existing tasks and the run history; new triggers are suppressed
                      and logged.
                    </p>
                  </>
                )}
                {detail.can.manager && r.status === "Paused" && (
                  <Button
                    loading={busy === "Resumed"}
                    onClick={async () => {
                      if (await post({ type: "resume" }, "Resumed")) reload();
                    }}
                  >
                    Resume rule
                  </Button>
                )}
                {detail.approvals.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {detail.approvals.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 text-caption"
                      >
                        <span>
                          <span className="font-mono">{a.ref}</span> · {a.initiator}
                        </span>
                        <Tag tone={approvalTone[a.status]}>{a.status}</Tag>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </FCard>
            <FCard
              icon={History}
              title="Versions"
              sub="Every change is kept; roll back to any version"
              flush
            >
              <ul className="divide-y divide-border">
                {[...r.versions].reverse().map((ver) => (
                  <li key={ver.version} className="flex items-start gap-3 px-5 py-3 text-small">
                    <span className="font-mono text-caption text-ink-500">v{ver.version}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink-900">{ver.reason}</span>
                      <span className="text-caption text-ink-500">
                        {ver.by} · {when(ver.at)}
                      </span>
                    </span>
                    {detail.can.manager && ver.version !== r.version && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (
                            await post(
                              { type: "rollback", version: ver.version },
                              "Rolled back as a new version",
                            )
                          )
                            reload();
                        }}
                      >
                        Roll back
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </FCard>
            <FCard icon={Repeat} title="Recent runs" sub={`${detail.runs.length} logged`} flush>
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {detail.runs.slice(0, 30).map((run) => (
                  <li key={run.id} className="px-5 py-2.5 text-caption">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-ink-700">
                        {run.ref} · v{run.ruleVersion}
                      </span>
                      <Tag tone={outcomeTone[run.outcome]}>{run.outcome}</Tag>
                    </span>
                    <span className="block text-ink-500">
                      {run.entity} · {when(run.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </FCard>
          </div>
        )}
      </div>
    </>
  );
}
