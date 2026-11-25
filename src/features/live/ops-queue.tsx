"use client";

import {
  Bookmark,
  Check,
  Circle,
  Filter,
  Plus,
  Search,
  X,
  Clock,
  History,
  Link2,
  ListChecks,
  Timer,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RecordCard, RecordFacts, RecordPopup } from "@/components/ui/record-popup";
import { RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/lib/live/client";
import {
  automationSources,
  bulkActions,
  bulkExcludedCategories,
  entityKinds,
  filterTasks,
  priorities,
  queueTabs,
  slaClasses,
  sortTasks,
  sorts,
  taskCategories,
  taskStatuses,
  teams,
  visibilities,
  type BulkAction,
  type OpsHubDto,
  type QueueSort,
  type QueueTab,
  type TaskDto,
} from "@/lib/live/operations";
import { cn } from "@/lib/cn";
import { EmptyNote } from "./bits";
import { th, td } from "./funding-bits";
import {
  PriorityTag,
  dueIn,
  ops,
  taskTone,
  textArea,
  when,
  tableBox,
  tableHead,
  TableFoot,
} from "./ops-bits";

type F = Parameters<typeof filterTasks>[1];
const blank = (me: string, tab: QueueTab): F => ({
  tab,
  me,
  search: "",
  category: "",
  status: "",
  priority: "",
  team: "",
  assignee: "",
  service: "",
  discipline: "",
  location: "",
  source: "",
  from: "",
  to: "",
});
type View = { name: string; f: Omit<F, "me">; sort: QueueSort };

export function QueueTabView({
  hub,
  tab,
  setTab,
  onDone,
}: {
  hub: OpsHubDto;
  tab: QueueTab;
  setTab: (t: QueueTab) => void;
  onDone: () => void;
}) {
  const now = useNow() ?? Date.parse(hub.now);
  const [f, setFState] = useState<F>(() => blank(hub.me.id, tab));
  const [sort, setSort] = useState<QueueSort>("Due Soonest");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<TaskDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState<BulkAction | "">("");
  const [views, setViews] = useState<View[]>([]);
  const storeKey = `medisense.ops.views.${hub.me.id}`;
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved views live in this browser
      setViews(JSON.parse(localStorage.getItem(storeKey) ?? "[]") as View[]);
    } catch {
      setViews([]);
    }
  }, [storeKey]);
  const setF = (p: Partial<F>) => {
    setFState((x) => ({ ...x, ...p }));
    setPicked(new Set());
  };
  const current = { ...f, tab };
  const rows = sortTasks(filterTasks(hub.tasks, current), sort);
  const tabCounts = Object.fromEntries(
    queueTabs.map((q) => [q, filterTasks(hub.tasks, { ...current, tab: q }).length]),
  ) as Record<QueueTab, number>;
  const options = useMemo(() => {
    const uniq = (k: (t: TaskDto) => string | null) =>
      [...new Set(hub.tasks.map(k).filter((x): x is string => Boolean(x)))].sort();
    return {
      assignee: uniq((t) => t.assigneeName),
      service: uniq((t) => t.service),
      discipline: uniq((t) => t.discipline),
      location: uniq((t) => t.locationType),
    };
  }, [hub.tasks]);
  const active = Boolean(
    f.search ||
    f.category ||
    f.status ||
    f.priority ||
    f.team ||
    f.assignee ||
    f.service ||
    f.discipline ||
    f.location ||
    f.source ||
    f.from ||
    f.to,
  );
  const pickedRows = rows.filter((r) => picked.has(r.id));
  const excluded = pickedRows.filter(
    (r) => bulkExcludedCategories.includes(r.category) || r.visibility === "Clinical Restricted",
  );

  const sel = (
    label: string,
    key: keyof F,
    list: readonly string[],
    all: string,
    width = "w-40",
  ) => (
    <div className={cn(width, "flex-none")}>
      <Select
        aria-label={label}
        className="h-9"
        value={String(f[key])}
        onChange={(e) => setF({ [key]: e.target.value })}
      >
        <option value="">{all}</option>
        {list.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    </div>
  );

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-1 rounded-card border border-border bg-surface p-1.5 shadow-lift"
        role="tablist"
        aria-label="Queue views"
      >
        {queueTabs.map((q) => (
          <button
            key={q}
            type="button"
            role="tab"
            aria-selected={tab === q}
            onClick={() => {
              setTab(q);
              setPicked(new Set());
            }}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-1.5 rounded-control px-3 text-small transition-colors",
              tab === q
                ? "bg-accent-tint font-semibold text-accent"
                : "text-ink-700 hover:bg-canvas",
            )}
          >
            {q}
            <span
              className={cn(
                "rounded-full px-1.5 text-caption",
                (q === "Overdue" || q === "Escalated") && tabCounts[q]
                  ? "bg-over-bg font-semibold text-over"
                  : "bg-sunken text-ink-700",
              )}
            >
              {tabCounts[q]}
            </span>
          </button>
        ))}
        <span className="ml-auto pr-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setCreating(true)}
            disabled={
              !hub.can.intake &&
              !hub.can.scheduler &&
              !hub.can.finance &&
              !hub.can.manager &&
              !hub.can.clinical
            }
          >
            <Plus className="size-3.5" aria-hidden="true" /> New task
          </Button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <Filter className="ml-1 size-4 text-ink-500" aria-hidden="true" />
        {sel("Category", "category", taskCategories, "All categories", "w-44")}
        {sel("Status", "status", taskStatuses, "All statuses")}
        {sel("Priority", "priority", priorities, "All priorities", "w-36")}
        {sel("Team", "team", teams, "All teams", "w-36")}
        {sel("Assigned user", "assignee", options.assignee, "Anyone", "w-44")}
        {sel("Service", "service", options.service, "All services", "w-48")}
        {sel("Discipline", "discipline", options.discipline, "All disciplines", "w-44")}
        {sel("Location type", "location", options.location, "Any location", "w-36")}
        {sel("Automation source", "source", automationSources, "Any source", "w-36")}
        <input
          type="date"
          aria-label="Due from"
          value={f.from}
          onChange={(e) => setF({ from: e.target.value })}
          className="h-9 rounded-control border border-border-strong px-2 text-small"
        />
        <input
          type="date"
          aria-label="Due to"
          value={f.to}
          onChange={(e) => setF({ to: e.target.value })}
          className="h-9 rounded-control border border-border-strong px-2 text-small"
        />
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={f.search}
            onChange={(e) => setF({ search: e.target.value })}
            aria-label="Search tasks"
            placeholder="Task, referral or appointment number, participant"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
        {active && (
          <button
            type="button"
            onClick={() => setF({ ...blank(hub.me.id, tab) })}
            className="inline-flex h-9 cursor-pointer items-center gap-1 px-2 text-small font-semibold text-accent"
          >
            <X className="size-3.5" aria-hidden="true" /> Clear
          </button>
        )}
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="text-caption text-ink-500">Sort</span>
          <div className="w-48">
            <Select
              aria-label="Sort"
              className="h-8"
              value={sort}
              onChange={(e) => setSort(e.target.value as QueueSort)}
            >
              {sorts.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <span className="ml-2 text-caption text-ink-500">Saved views</span>
          {views.map((v) => (
            <span
              key={v.name}
              className="inline-flex items-center rounded-tag border border-border-strong"
            >
              <button
                type="button"
                className="cursor-pointer px-2 py-0.5 text-caption font-semibold text-ink-700 hover:text-accent"
                onClick={() => {
                  setFState({ ...v.f, me: hub.me.id });
                  setTab(v.f.tab);
                  setSort(v.sort);
                }}
              >
                {v.name}
              </button>
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                className="cursor-pointer px-1 text-ink-500 hover:text-over"
                onClick={() => {
                  const next = views.filter((x) => x.name !== v.name);
                  setViews(next);
                  localStorage.setItem(storeKey, JSON.stringify(next));
                }}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const name = `${tab}${f.team ? ` · ${f.team}` : ""}${f.category ? ` · ${f.category}` : ""}${f.priority ? ` · ${f.priority}` : ""}`;
              const { me, ...rest } = current;
              void me;
              const next = [...views.filter((x) => x.name !== name), { name, f: rest, sort }];
              setViews(next);
              localStorage.setItem(storeKey, JSON.stringify(next));
            }}
          >
            <Bookmark className="size-3.5" aria-hidden="true" /> Save this view
          </Button>
          <span className="ml-auto text-caption text-ink-500">
            {rows.length} task{rows.length === 1 ? "" : "s"} shown · counts follow the filters
          </span>
        </div>
      </div>

      {picked.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-card border border-accent bg-accent-tint px-4 py-3"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-small font-semibold text-ink-900">{picked.size} selected</span>
          <div className="w-56">
            <Select
              aria-label="Bulk action"
              className="h-9"
              value={bulk}
              onChange={(e) => setBulk(e.target.value as BulkAction)}
            >
              <option value="">Choose a safe action</option>
              {bulkActions.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </div>
          <BulkRun
            action={bulk}
            ids={[...picked]}
            onDone={() => {
              setPicked(new Set());
              setBulk("");
              onDone();
            }}
          />
          <span className="text-caption text-ink-700">
            {excluded.length
              ? `${excluded.length} clinical or restricted task(s) will be skipped. `
              : ""}
            Clinical approvals, disclosures, recordings, note signatures and funding overrides are
            never bulk actions.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyNote title="No tasks match this view.">
          Change the filters or the queue tab.
        </EmptyNote>
      ) : (
        <div className={tableBox}>
          <table className="w-full text-left text-small">
            <thead className={tableHead}>
              <tr>
                <th className={th}>
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={picked.size > 0 && picked.size === rows.length}
                    onChange={(e) =>
                      setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
                <th className={th}>Task</th>
                <th className={th}>Related</th>
                <th className={th}>Team · owner</th>
                <th className={th}>Priority</th>
                <th className={th}>Due</th>
                <th className={th}>Source</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className={cn(
                    "transition-colors hover:bg-canvas",
                    picked.has(t.id) && "bg-accent-tint",
                  )}
                >
                  <td className={td}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.ref}`}
                      checked={picked.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        setPicked(next);
                      }}
                    />
                  </td>
                  <td className={cn(td, "max-w-96")}>
                    <button
                      type="button"
                      onClick={() => setPreview(t)}
                      className="block cursor-pointer text-left font-semibold text-ink-900 hover:text-accent"
                    >
                      {t.title}
                    </button>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-500">
                      <span className="font-mono">{t.ref}</span> · {t.category}
                      {t.visibility === "Clinical Restricted" && (
                        <Tag tone="outline">Clinical restricted</Tag>
                      )}
                      {t.suggestion && <Tag tone="outline">Suggested · confirm</Tag>}
                      {t.tags.map((x) => (
                        <Tag key={x} tone="outline">
                          {x}
                        </Tag>
                      ))}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="block font-mono text-caption text-ink-700">
                      {t.related.ref}
                    </span>
                    <span className="text-caption text-ink-500">{t.related.label}</span>
                  </td>
                  <td className={td}>
                    <span className="block text-ink-900">
                      {t.assigneeName ?? <span className="text-ink-500">Unassigned</span>}
                    </span>
                    <span className="text-caption text-ink-500">{t.team}</span>
                  </td>
                  <td className={td}>
                    <PriorityTag p={t.priority} />
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <span
                      className={cn(
                        "block",
                        t.overdue ? "font-semibold text-over" : "text-ink-900",
                      )}
                    >
                      {when(t.dueAt)}
                    </span>
                    <span className="text-caption text-ink-500">
                      {dueIn(t.dueAt, now)} · {t.sla}
                    </span>
                  </td>
                  <td className={td}>
                    {t.source === "Rule" ? (
                      <span className="whitespace-nowrap">
                        <RuleMark>{t.ruleCode ?? "Rule"}</RuleMark>
                      </span>
                    ) : (
                      <span className="text-caption text-ink-700">{t.source}</span>
                    )}
                  </td>
                  <td className={td}>
                    <Tag tone={taskTone[t.status]}>{t.status}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <TableFoot shown={rows.length} total={hub.tasks.length} noun="tasks" />}
      {preview && <Preview task={preview} onClose={() => setPreview(null)} />}
      {creating && <NewTask hub={hub} onClose={() => setCreating(false)} onDone={onDone} />}
    </>
  );
}

function BulkRun({
  action,
  ids,
  onDone,
}: {
  action: BulkAction | "";
  ids: string[];
  onDone: () => void;
}) {
  const [team, setTeam] = useState("Intake");
  const [tag, setTag] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!action) return null;
  return (
    <>
      {action === "Assign to team" && (
        <div className="w-36">
          <Select
            aria-label="Team"
            className="h-9"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
      )}
      {action === "Apply tag" && (
        <input
          aria-label="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag"
          className="h-9 w-36 rounded-control border border-border-strong px-2 text-small"
        />
      )}
      {action === "Close as duplicate" && (
        <label className="flex items-center gap-2 text-caption text-ink-900">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />{" "}
          I&apos;ve reviewed each one
        </label>
      )}
      <Button
        size="sm"
        variant="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const res = await ops<{ done: string[]; skipped: { ref: string; why: string }[] }>(
            "/api/care/operations",
            { type: "bulk", bulk: { ids, action, team, tag, reviewed } },
            "Bulk action done",
          );
          setBusy(false);
          if (res) {
            if (res.skipped.length) {
              toast(`${res.done.length} done, ${res.skipped.length} skipped`, {
                tone: "warning",
                detail: res.skipped.map((s) => `${s.ref}: ${s.why}`).join("; "),
              });
            }
            onDone();
          }
        }}
      >
        Apply to {ids.length}
      </Button>
    </>
  );
}

function Preview({ task: t, onClose }: { task: TaskDto; onClose: () => void }) {
  const done = t.checklist.filter((c) => c.done).length;
  return (
    <RecordPopup
      title={t.ref}
      description={t.title}
      onClose={onClose}
      meta={
        <>
          <Tag tone={taskTone[t.status]}>{t.status}</Tag>
          <PriorityTag p={t.priority} />
          <Tag tone="outline">{t.visibility}</Tag>
          {t.source === "Rule" && <RuleMark>{`${t.ruleCode} v${t.ruleVersion}`}</RuleMark>}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink variant="primary" href={`/care/operations/tasks/${t.id}`}>
            Open task
          </ButtonLink>
          {t.related.href && (
            <ButtonLink
              variant="secondary"
              href={`${t.related.href}${t.related.href.includes("?") ? "&" : "?"}from=ops-${t.id}`}
            >
              Open {t.related.kind.toLowerCase()}
            </ButtonLink>
          )}
        </div>
      }
      aside={
        <RecordCard title="History" icon={History} flush={false}>
          {t.history.length === 0 ? (
            <p className="text-small text-ink-500">Nothing recorded yet.</p>
          ) : (
            <ol className="relative ml-2 border-l border-border pl-5">
              {[...t.history]
                .reverse()
                .slice(0, 8)
                .map((h, i) => (
                  <li key={i} className="relative pb-3 last:pb-0">
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                    />
                    <p className="text-small text-ink-900">{h.action}</p>
                    <p className="text-caption text-ink-500">
                      {h.by}, {when(h.at)}
                    </p>
                  </li>
                ))}
            </ol>
          )}
        </RecordCard>
      }
    >
      <RecordFacts
        facts={[
          { icon: Users, label: "Team", value: t.team },
          { icon: UserRound, label: "Owner", value: t.assigneeName ?? "Unassigned" },
          { icon: Clock, label: "Due", value: when(t.dueAt) },
        ]}
      />
      <RecordFacts
        facts={[
          { icon: Timer, label: "SLA", value: t.sla },
          { icon: Link2, label: "Related", value: `${t.related.kind} ${t.related.ref}` },
          { icon: UserRound, label: "Participant", value: t.participant ?? "None" },
        ]}
      />
      {t.restrictedHidden && (
        <p className="rounded-control bg-sunken px-4 py-3 text-small text-ink-700">
          A clinical note on this task is visible to the Clinical Lead only.
        </p>
      )}
      {t.checklist.length > 0 && (
        <RecordCard
          title="Checklist"
          icon={ListChecks}
          aside={`${done} of ${t.checklist.length} done`}
        >
          <ul className="divide-y divide-border">
            {t.checklist.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "flex items-start gap-2.5 px-4 py-2.5 text-small text-ink-900",
                  c.done && "text-ink-500 line-through",
                )}
              >
                {c.done ? (
                  <Check className="mt-0.5 size-4 flex-none text-healthy" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 size-4 flex-none text-ink-400" aria-label="Open" />
                )}
                {c.label}
              </li>
            ))}
          </ul>
        </RecordCard>
      )}
    </RecordPopup>
  );
}

function NewTask({
  hub,
  onClose,
  onDone,
}: {
  hub: OpsHubDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [v, setV] = useState(() => ({
    title: "",
    category: "Referral",
    priority: "Normal",
    urgentReason: "",
    team: hub.can.teams[0] ?? "Intake",
    assigneeId: "",
    relatedKind: "Referral",
    relatedRef: "",
    due: new Date(Date.now() + 26 * 3_600_000).toISOString().slice(0, 16),
    sla: "Standard",
    visibility: "Internal",
    note: "",
    checklist: "",
    allowPastDue: false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const eligible = hub.staff.filter((s) => s.teams.includes(v.team as TaskDto["team"]));
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  async function save() {
    const e: Record<string, string> = {};
    if (v.title.trim().length < 5) e.title = "At least 5 characters";
    if (v.relatedRef.trim().length < 2) e.relatedRef = "Link the task to a record";
    if (v.priority === "Urgent" && v.urgentReason.trim().length < 5)
      e.urgentReason = "Say why this is urgent";
    if (!v.allowPastDue && new Date(v.due).getTime() < Date.now())
      e.due = "The due date is in the past";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await ops<{ id: string }>(
      "/api/care/operations",
      {
        type: "task",
        task: {
          title: v.title,
          category: v.category,
          priority: v.priority,
          urgentReason: v.urgentReason,
          team: v.team,
          assigneeId: v.assigneeId || null,
          relatedKind: v.relatedKind,
          relatedRef: v.relatedRef,
          dueAt: new Date(v.due).toISOString(),
          sla: v.sla,
          visibility: v.visibility,
          note: v.note,
          checklist: v.checklist
            .split("\n")
            .map((x) => x.trim())
            .filter((x) => x.length >= 2),
          allowPastDue: v.allowPastDue,
        },
      },
      "Task created",
    );
    setBusy(false);
    if (res) {
      onDone();
      onClose();
    }
  }
  const pick = (label: string, key: keyof typeof v, list: readonly string[]) => (
    <Field label={label} error={errors[key]}>
      <Select
        aria-label={label}
        value={String(v[key])}
        onChange={(e) => set({ [key]: e.target.value } as Partial<typeof v>)}
      >
        {list.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    </Field>
  );
  return (
    <Sheet
      title="New task"
      description="A manual administrative task. Every field marked here is checked before it's saved."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" loading={busy} onClick={save}>
            Create task
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {Object.keys(errors).length > 0 && (
          <div
            role="alert"
            className="rounded-control border border-over-bg bg-over-bg px-3 py-2 text-caption text-over"
          >
            Fix {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? "" : "s"}:{" "}
            {Object.values(errors).join("; ")}.
          </div>
        )}
        <Field label="Title (action first, 5 to 150 characters)" error={errors.title}>
          <input
            className={inputClass}
            maxLength={150}
            value={v.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Call the school to confirm the visit room"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {pick("Category", "category", taskCategories)}
          {pick("Priority", "priority", priorities)}
        </div>
        {v.priority === "Urgent" && (
          <Field
            label="Why is it urgent?"
            error={errors.urgentReason}
            hint="Urgent tasks also go to the escalation inbox."
          >
            <input
              className={inputClass}
              value={v.urgentReason}
              onChange={(e) => set({ urgentReason: e.target.value })}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Team">
            <Select
              aria-label="Team"
              value={v.team}
              onChange={(e) => set({ team: e.target.value as typeof v.team, assigneeId: "" })}
            >
              {teams.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned user" hint="Only people in the team">
            <Select
              aria-label="Assigned user"
              value={v.assigneeId}
              onChange={(e) => set({ assigneeId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {pick(
            "Related record",
            "relatedKind",
            entityKinds.filter((k) => k !== "Rule"),
          )}
          <Field
            label="Record number"
            error={errors.relatedRef}
            hint="REF-, MRN-, APT-, INV- or FP- number"
          >
            <input
              className={inputClass}
              value={v.relatedRef}
              onChange={(e) => set({ relatedRef: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due (Brisbane)" error={errors.due}>
            <input
              type="datetime-local"
              className={inputClass}
              value={v.due}
              onChange={(e) => set({ due: e.target.value })}
            />
          </Field>
          {pick("SLA", "sla", slaClasses)}
        </div>
        <label className="flex items-center gap-2 text-caption text-ink-700">
          <input
            type="checkbox"
            checked={v.allowPastDue}
            onChange={(e) => set({ allowPastDue: e.target.checked })}
          />{" "}
          Allow a due date in the past (explicit override)
        </label>
        {pick("Visibility", "visibility", visibilities)}
        <Field
          label="Checklist (one item per line)"
          hint="Every item must be ticked before the task can be completed"
        >
          <textarea
            className={textArea}
            value={v.checklist}
            onChange={(e) => set({ checklist: e.target.value })}
          />
        </Field>
        <Field label="Note">
          <textarea
            className={textArea}
            maxLength={10000}
            value={v.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
