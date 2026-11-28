"use client";

import { Check, ListPlus, Lock, Search, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiDraft } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { TabPanel, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import {
  categories,
  priorities,
  reminders,
  statuses,
  statusTone,
  visibilities,
  type CareTeamRow,
  type TaskRow,
} from "@/lib/live/coord";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, td, th } from "./funding-bits";
import { KpiBand, ops, tableBox, tableHead, textArea, when } from "./ops-bits";

const tabs = [
  { id: "work", label: "Tasks" },
  { id: "suggestions", label: "AI suggestions" },
  { id: "team", label: "Care team" },
  { id: "supervision", label: "Supervision" },
] as const;
type Scope = "mine" | "team" | "overdue" | "waiting";
export type Options = {
  participants: { clientId: string; name: string; needs: { id: string; discipline: string }[] }[];
  staff: { id: string; name: string; role: string }[];
};

/** Module 17 screen: My Tasks, AI suggestions, Care team and Supervision. */
export function CoordHub({
  base,
  embedded = false,
}: {
  base: "/therapist/coordination" | "/care/coordination";
  /** Inside a combined page, which brings its own title. */
  embedded?: boolean;
}) {
  const { data, error, loading, reload } = useResource<{
    rows: TaskRow[];
    team: CareTeamRow[];
    options: Options;
  }>("/api/care/coordination", (e) => e.type === "care");
  const clock = useNow();
  const router = useRouter();
  const addressTab = useTab(tabs);
  const localTab = useState<(typeof tabs)[number]["id"]>("work");
  // Inside Work and approvals the page's own tabs own the address.
  const [tab, setTab] = embedded ? localTab : addressTab;
  const [scope, setScope] = useState<Scope>(base === "/therapist/coordination" ? "mine" : "team");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [create, setCreate] = useState(false);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data || clock === null) return <Skeleton className="h-[760px]" />;
  const all = data.rows.filter((r) => r.suggestion !== "pending");
  const suggestions = data.rows.filter((r) => r.suggestion === "pending");
  const open = all.filter((r) => !["Completed", "Cancelled"].includes(r.status));
  const query = q.trim().toLowerCase();
  const rows = all
    .filter((r) =>
      scope === "mine"
        ? r.mine
        : scope === "overdue"
          ? r.overdue
          : scope === "waiting"
            ? r.status.startsWith("Waiting")
            : true,
    )
    .filter((r) => (!category || r.category === category) && (!status || r.status === status))
    .filter(
      (r) =>
        !query ||
        `${r.ref} ${r.title} ${r.participant ?? ""} ${r.participantId}`
          .toLowerCase()
          .includes(query),
    )
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        priorities.indexOf(b.priority as (typeof priorities)[number]) -
          priorities.indexOf(a.priority as (typeof priorities)[number]) ||
        (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"),
    );
  const today = new Date(clock).toISOString().slice(0, 10);
  const review = all.filter((r) => r.status === "Pending Review");
  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="Live care"
          title={
            base === "/therapist/coordination" ? "Tasks and care coordination" : "Care coordination"
          }
          description="Follow-ups, handovers, referrals, supervision and requests, each with an owner and a due date"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => setCreate(true)}>
                <ListPlus className="size-4" aria-hidden="true" /> New task
              </Button>
              <LiveBadge />
            </div>
          }
        />
      )}
      <KpiBand
        label="Task figures"
        items={[
          {
            label: "Open",
            value: open.length,
            sub: `${open.filter((r) => r.mine).length} assigned to you`,
            onClick: () => {
              setTab("work");
              setScope("mine");
              setStatus("");
            },
          },
          {
            label: "Due today",
            value: open.filter((r) => r.dueAt?.slice(0, 10) === today).length,
            sub: "due before close of day",
          },
          {
            label: "Overdue",
            value: open.filter((r) => r.overdue).length,
            sub: "past the due date",
            tone: open.some((r) => r.overdue) ? "over" : undefined,
            onClick: () => {
              setTab("work");
              setScope("overdue");
            },
          },
          {
            label: "Waiting",
            value: open.filter((r) => r.status.startsWith("Waiting")).length,
            sub: "on patient, admin or clinician",
            onClick: () => {
              setTab("work");
              setScope("waiting");
            },
          },
          {
            label: "Pending review",
            value: review.length,
            sub: "supervisor decisions",
            onClick: () => setTab("supervision"),
          },
          {
            label: "AI suggestions",
            value: suggestions.length,
            sub: "waiting for your decision",
            tone: suggestions.length ? "watch" : undefined,
            onClick: () => setTab("suggestions"),
          },
        ]}
      />

      <TabPanel id="work" value={tab}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
            <Segmented<Scope>
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[
                { id: "mine", label: "My tasks" },
                { id: "team", label: "Team tasks" },
                { id: "overdue", label: "Overdue" },
                { id: "waiting", label: "Waiting" },
              ]}
            />
            <div className="w-52">
              <Select
                aria-label="Category"
                className="h-9"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Any category</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <Select
                aria-label="Status"
                className="h-9"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Any status</option>
                {statuses.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
            <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search tasks"
                placeholder="Task ID, title or participant"
                className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => setQ("")}
                  className="cursor-pointer text-ink-500"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </label>
          </div>
          <div className={tableBox}>
            <table className="w-full text-left text-small">
              <thead className={tableHead}>
                <tr>
                  <th className={th}>Task</th>
                  <th className={th}>Participant</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Source</th>
                  <th className={th}>Priority</th>
                  <th className={th}>Due</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className={td}>
                      <a
                        href={`${base}/${r.id}`}
                        className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                      >
                        {r.restricted ? "Restricted follow-up" : r.title}
                      </a>
                      <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                        {r.restricted && <Lock className="size-3" aria-label="Restricted" />}
                        {r.ref} · {r.category}
                      </span>
                    </td>
                    <td className={td}>
                      {r.participant ? (
                        <>
                          <span className="block text-ink-900">{r.participant}</span>
                          <span className="text-caption text-ink-500">{r.discipline}</span>
                        </>
                      ) : (
                        <span className="text-ink-500">General</span>
                      )}
                    </td>
                    <td className={cn(td, r.mine ? "font-semibold text-ink-900" : "text-ink-700")}>
                      {r.mine ? "You" : r.assignee}
                    </td>
                    <td className={cn(td, "text-ink-700")}>
                      {r.source}
                      {r.sync !== "Synced" && (
                        <span className="block text-caption font-semibold text-over">{r.sync}</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        td,
                        r.priority === "Urgent" || r.priority === "High"
                          ? "font-semibold text-over"
                          : "text-ink-700",
                      )}
                    >
                      {r.priority}
                    </td>
                    <td
                      className={cn(
                        td,
                        "whitespace-nowrap",
                        r.overdue && "font-semibold text-over",
                      )}
                    >
                      {r.dueAt ? `${when(r.dueAt)}${r.overdue ? " · overdue" : ""}` : "No due date"}
                    </td>
                    <td className={td}>
                      <Tag tone={statusTone[r.status]}>{r.status}</Tag>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-small text-ink-500">
                      Nothing here. Change the scope or filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2! px-1 text-caption text-ink-500">
            {rows.length} of {all.length} tasks · scroll inside the table for more
          </p>
        </div>
      </TabPanel>

      <TabPanel id="suggestions" value={tab}>
        <Suggestions rows={suggestions} reload={reload} />
      </TabPanel>

      <TabPanel id="team" value={tab}>
        <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.team.map((p) => (
            <FCard
              key={p.participantId || p.participant}
              icon={Users}
              title={p.participant}
              sub={p.participantId}
            >
              <ul className="flex flex-col gap-2">
                {p.episodes.map((e) => (
                  <li
                    key={e.discipline}
                    className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-small"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-900">{e.discipline}</span>
                      <span className="text-caption text-ink-500">
                        {e.clinician} · {e.goals} goal(s)
                      </span>
                    </span>
                    {e.restricted && (
                      <Tag tone="outline">
                        <Lock className="size-3" aria-hidden="true" /> Restricted
                      </Tag>
                    )}
                  </li>
                ))}
              </ul>
            </FCard>
          ))}
          {!data.team.length && (
            <p className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center text-small text-ink-500 md:col-span-2 xl:col-span-3">
              Care teams appear for the participants you treat.
            </p>
          )}
        </div>
      </TabPanel>

      <TabPanel id="supervision" value={tab}>
        <div className={tableBox}>
          <table className="w-full text-left text-small">
            <thead className={tableHead}>
              <tr>
                <th className={th}>Waiting for review</th>
                <th className={th}>Participant</th>
                <th className={th}>Owner</th>
                <th className={th}>Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {review.map((r) => (
                <tr key={r.id} className="hover:bg-canvas">
                  <td className={td}>
                    <a
                      href={`${base}/${r.id}`}
                      className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                    >
                      {r.title}
                    </a>
                    <span className="block font-mono text-caption text-ink-500">{r.ref}</span>
                  </td>
                  <td className={td}>{r.participant ?? "General"}</td>
                  <td className={td}>{r.assignee}</td>
                  <td className={cn(td, r.overdue && "font-semibold text-over")}>
                    {r.dueAt ? when(r.dueAt) : "—"}
                  </td>
                </tr>
              ))}
              {!review.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-small text-ink-500">
                    Nothing waiting for review.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </TabPanel>
      {create && (
        <NewTask
          options={data.options}
          onClose={() => setCreate(false)}
          onCreated={(id) => router.push(`${base}/${id}`)}
        />
      )}
    </>
  );
}

export function Suggestions({ rows, reload }: { rows: TaskRow[]; reload: () => void }) {
  const seen = new Map<string, number>();
  return (
    <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => {
        const key = `${r.title}|${r.participant}|${r.category}`;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return (
          <div key={r.id} className="[&>*]:h-full">
            <AiDraft label={r.category} suggestionsOnly meta={r.source}>
              <p className="text-small font-semibold text-ink-900">{r.title}</p>
              <p className="text-caption text-ink-500">
                {r.participant} · {r.discipline}
              </p>
              {n > 1 && (
                <p className="mt-2 rounded-control border border-watch bg-watch-bg px-2 py-1 text-caption">
                  Possible duplicate of another suggestion
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    if (
                      await ops(
                        `/api/care/coordination/${r.id}`,
                        { type: "suggestion", decision: "accept", title: r.title },
                        "Accepted",
                        "Now an open task",
                      )
                    )
                      reload();
                  }}
                >
                  <Check className="size-3.5" aria-hidden="true" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await ops(
                        `/api/care/coordination/${r.id}`,
                        { type: "suggestion", decision: "reject", title: "" },
                        "Rejected",
                      )
                    )
                      reload();
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" /> Reject
                </Button>
              </div>
            </AiDraft>
          </div>
        );
      })}
      {!rows.length && (
        <p className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center text-small text-ink-500 md:col-span-2 xl:col-span-3">
          No suggestions waiting.
        </p>
      )}
    </div>
  );
}

export function NewTask({
  options,
  onClose,
  onCreated,
}: {
  options: Options;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const first = options.participants[0];
  const [v, setV] = useState({
    title: "",
    category: "Clinical Follow-up",
    clientId: first?.clientId ?? "",
    needId: first?.needs[0]?.id ?? "",
    assigneeId: options.staff[0]?.id ?? "",
    priority: "Normal",
    dueAt: "",
    noDue: false,
    reminder: "24h Before",
    visibility: "Care Team",
    instructions: "",
    checklist: [] as string[],
    open: true,
    urgentDetail: "",
  });
  const [item, setItem] = useState("");
  const [busy, setBusy] = useState(false);
  const p = options.participants.find((x) => x.clientId === v.clientId);
  return (
    <Sheet
      title="New task"
      description="An owner with access to the record, a due date and clear instructions"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const res = await ops<{ id: string }>(
              "/api/care/coordination",
              { ...v, dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : "" },
              "Task created",
            );
            setBusy(false);
            if (res?.id) onCreated(res.id);
          }}
        >
          Create task
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <input
            className={inputClass}
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            placeholder="A clear action, e.g. Call the carer about the shower chair"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select
              aria-label="Category"
              value={v.category}
              onChange={(e) => setV({ ...v, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              aria-label="Priority"
              value={v.priority}
              onChange={(e) => setV({ ...v, priority: e.target.value })}
            >
              {priorities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Participant">
            <Select
              aria-label="Participant"
              value={v.clientId}
              onChange={(e) => {
                const x = options.participants.find((y) => y.clientId === e.target.value);
                setV({ ...v, clientId: e.target.value, needId: x?.needs[0]?.id ?? "" });
              }}
            >
              {options.participants.map((x) => (
                <option key={x.clientId} value={x.clientId}>
                  {x.name}
                </option>
              ))}
              <option value="">No participant (general task)</option>
            </Select>
          </Field>
          <Field label="Course of care">
            <Select
              aria-label="Course of care"
              value={v.needId}
              onChange={(e) => setV({ ...v, needId: e.target.value })}
            >
              {(p?.needs ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.discipline}
                </option>
              ))}
              <option value="">Not specific to one course of care</option>
            </Select>
          </Field>
          <Field label="Owner">
            <Select
              aria-label="Owner"
              value={v.assigneeId}
              onChange={(e) => setV({ ...v, assigneeId: e.target.value })}
            >
              {options.staff.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility">
            <Select
              aria-label="Visibility"
              value={v.visibility}
              onChange={(e) => setV({ ...v, visibility: e.target.value })}
            >
              {visibilities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Due">
            <input
              type="datetime-local"
              className={inputClass}
              disabled={v.noDue}
              value={v.dueAt}
              onChange={(e) => setV({ ...v, dueAt: e.target.value })}
            />
          </Field>
          <Field label="Reminder">
            <Select
              aria-label="Reminder"
              value={v.reminder}
              onChange={(e) => setV({ ...v, reminder: e.target.value })}
            >
              {reminders.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={v.noDue}
            onChange={(e) =>
              setV({
                ...v,
                noDue: e.target.checked,
                reminder: e.target.checked ? "None" : v.reminder,
              })
            }
          />{" "}
          No due date
        </label>
        {v.priority === "Urgent" && (
          <Field label="Why it's urgent, and who needs to know">
            <input
              className={inputClass}
              value={v.urgentDetail}
              onChange={(e) => setV({ ...v, urgentDetail: e.target.value })}
            />
          </Field>
        )}
        <Field label="Instructions">
          <textarea
            className={textArea}
            value={v.instructions}
            onChange={(e) => setV({ ...v, instructions: e.target.value })}
          />
        </Field>
        <div className="flex gap-2">
          <input
            aria-label="Checklist item"
            placeholder="Add a checklist item"
            className={inputClass}
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!item.trim()}
            onClick={() => {
              setV({ ...v, checklist: [...v.checklist, item.trim()] });
              setItem("");
            }}
          >
            Add
          </Button>
        </div>
        {v.checklist.length > 0 && (
          <ul className="flex flex-col gap-1 text-small text-ink-700">
            {v.checklist.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
