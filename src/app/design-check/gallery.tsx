"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AiChip,
  AiDraft,
  AiIcon,
  ApprovedLabel,
  DraftLabel,
  RuleMark,
  Signature,
} from "@/components/ai/provenance";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Button } from "@/components/ui/button";
import { CapacityMeter } from "@/components/ui/capacity-meter";
import { Card, CardTitle } from "@/components/ui/card";
import { FilterChips } from "@/components/ui/filter-chips";
import { MetricBand } from "@/components/ui/metric-band";
import { Avatar, Ring, Stepper } from "@/components/ui/premium";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Field, inputClass, Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { TableHeader, TableRow } from "@/components/ui/table";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { PriorityTag, StatusTag, Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import {
  CaseloadTag,
  EmptyNote,
  ErrorNote,
  LiveBadge,
  Panel,
  Skeleton,
  Stars,
} from "@/features/live/bits";
import { Choice, TextArea, TextField, Tick } from "@/features/live/form-bits";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-border py-4 first:border-0 first:pt-0 md:grid-cols-[180px_1fr]">
      <p className="pt-2 label-caps">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const columns = "minmax(0,2fr) minmax(0,1fr) 120px 110px";
const trend = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => ({
  d,
  a: [62, 68, 71, 66, 74][i]!,
  b: [40, 44, 39, 47, 50][i]!,
}));

export function Gallery() {
  const [tab, setTab] = useState<"one" | "two" | "three">("one");
  const [seg, setSeg] = useState<"open" | "closed" | "all">("open");
  const [chip, setChip] = useState<"all" | "mine">("all");
  const [on, setOn] = useState(true);
  const [pick, setPick] = useState<"Home" | "School" | "Telehealth" | "">("Home");
  const [ticked, setTicked] = useState(true);
  const [sel, setSel] = useState("north");
  const [text, setText] = useState("Leo Harrison");
  const [sheet, setSheet] = useState(false);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:px-10">
      <header>
        <p className="label-caps">Design check · dev only</p>
        <h1 className="mt-2 type-display text-display">Every component, every state</h1>
        <p className="mt-2 text-body text-ink-700">
          Switch the theme from the palette button to check each one.
        </p>
      </header>

      <Card className="p-6">
        <Row label="Buttons">
          <Button variant="primary">Accept patient</Button>
          <Button>Request information</Button>
          <Button variant="ghost">View referral</Button>
          <Button variant="danger">
            <Trash2 className="size-4" aria-hidden="true" /> Decline
          </Button>
          <Button variant="primary" loading>
            Signing…
          </Button>
          <Button variant="primary" disabled>
            Sign note
          </Button>
          <Button size="sm">Small</Button>
          <Button size="icon" aria-label="Add">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </Row>
        <Row label="Status tags">
          <Tag tone="healthy">Confirmed</Tag>
          <Tag tone="watch">Pending Signature</Tag>
          <Tag tone="over">Did not attend</Tag>
          <Tag tone="available">In progress</Tag>
          <Tag tone="neutral">Draft</Tag>
          <StatusTag status="healthy" />
          <StatusTag status="monitor" />
          <StatusTag status="at-risk" />
          <CaseloadTag status="Watch" />
          <PriorityTag priority="High" />
        </Row>
        <Row label="Meta and live">
          <Tag tone="meta">Telehealth</Tag>
          <Tag tone="meta">Invoiced</Tag>
          <Tag tone="live">Live</Tag>
          <LiveBadge />
        </Row>
        <Row label="Three layers">
          <AiChip />
          <RuleMark />
          <RuleMark>Automation</RuleMark>
          <span className="flex items-center gap-1.5 text-small text-ink-700">
            <AiIcon /> AI mark
          </span>
        </Row>
        <Row label="Feedback">
          <Button
            onClick={() => toast("Referral accepted", { detail: "2 service requests created" })}
          >
            Success toast
          </Button>
          <Button
            onClick={() =>
              toast("Couldn't save the note", {
                tone: "error",
                detail: "Check your connection and try again.",
              })
            }
          >
            Error toast
          </Button>
          <Button onClick={() => setSheet(true)}>Open sheet</Button>
        </Row>
      </Card>

      <MetricBand
        label="Metrics"
        metrics={[
          { label: "Intake review", value: 4, caption: "2 new today" },
          { label: "Needs information", value: 2, caption: "Oldest 3 days", tone: "watch" },
          {
            label: "Clinical triage",
            value: 3,
            caption: "Waiting for a Clinical Lead",
            flagged: true,
          },
          { label: "Funding review", value: 1 },
          { label: "Accepted", value: 12, caption: "This month" },
        ]}
      />

      <div>
        <Tabs
          label="Example tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "one", label: "Next step" },
            { id: "two", label: "Requests", count: 2, alert: true },
            { id: "three", label: "My patients", count: 17 },
          ]}
        />
        <TabPanel id={tab} value={tab}>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div role="table" aria-label="Example table">
              <TableHeader columns={columns}>
                <span>Patient</span>
                <span>Funding</span>
                <span>Updated</span>
                <span>Status</span>
              </TableHeader>
              {[
                [
                  "Leo Harrison",
                  "NDIS · plan managed",
                  "14 min ago",
                  <Tag key="t" tone="watch">
                    Intake review
                  </Tag>,
                ],
                [
                  "Mia Robinson",
                  "Private",
                  "2 h ago",
                  <Tag key="t" tone="healthy">
                    Accepted
                  </Tag>,
                ],
                [
                  "Ruth Hallam",
                  "Aged Care",
                  "Yesterday",
                  <Tag key="t" tone="over">
                    Risk review
                  </Tag>,
                ],
              ].map(([name, fund, when, status]) => (
                <TableRow key={name as string} columns={columns}>
                  <span className="font-semibold text-ink-900">{name}</span>
                  <span className="text-ink-700">{fund}</span>
                  <span className="text-ink-500">{when}</span>
                  <span>{status}</span>
                </TableRow>
              ))}
            </div>
          </div>
        </TabPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Form controls" action={<Button size="sm">Action</Button>}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Segmented
                label="Status"
                value={seg}
                onChange={setSeg}
                options={[
                  { id: "open", label: "Open" },
                  { id: "closed", label: "Closed" },
                  { id: "all", label: "All" },
                ]}
              />
              <FilterChips
                label="Owner"
                value={chip}
                onChange={setChip}
                options={[
                  { id: "all", label: "All", count: 12 },
                  { id: "mine", label: "Mine", count: 3 },
                ]}
              />
            </div>
            <SearchField label="Search" placeholder="Search patients" />
            <TextField label="Participant name" value={text} onChange={setText} required />
            <TextField
              label="NDIS number"
              value=""
              onChange={() => {}}
              required
              error="Enter the 9-digit NDIS number."
            />
            <Field label="Disabled">
              <input className={inputClass} disabled value="Locked after signing" readOnly />
            </Field>
            <Field label="Region">
              <Select aria-label="Region" value={sel} onChange={(e) => setSel(e.target.value)}>
                <option value="north">Brisbane North</option>
                <option value="south">Brisbane South</option>
              </Select>
            </Field>
            <TextArea
              label="Notes"
              value=""
              onChange={() => {}}
              rows={3}
              hint="Plain words; the patient may see a summary."
            />
            <Choice
              label="Service location"
              options={["Home", "School", "Telehealth"] as const}
              value={pick}
              onChange={setPick}
            />
            <Tick checked={ticked} onChange={setTicked}>
              I confirm I have consent to make this referral.
            </Tick>
            <div className="flex items-center gap-3 text-small">
              <Switch on={on} onToggle={() => setOn(!on)} label="Auto-allocate low-risk" />{" "}
              Auto-allocate low-risk
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <AiDraft label="AI completeness review" suggestionsOnly meta="Just now">
            <ul className="list-disc pl-5 text-small text-ink-700">
              <li>NDIS plan document not attached.</li>
              <li>Plan manager email missing.</li>
            </ul>
          </AiDraft>
          <AiDraft label="AI draft · SOAP note" generating />
          <Card className="flex flex-col gap-3 p-5">
            <DraftLabel meta="Version 2" />
            <ApprovedLabel meta="Tue, 10 Nov">Approved by Sarah Thompson</ApprovedLabel>
            <Signature
              name="Daniel Okafor"
              role="Occupational Therapist"
              when="Tue, 10 Nov, 11:42 am"
            />
          </Card>
          <Card className="p-5">
            <CardTitle
              id="misc"
              title="People and progress"
              description="Avatars, rings, stars, meters"
            />
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <Avatar name="Leo Harrison" />
              <Avatar name="Daniel Okafor" size={32} />
              <Ring percent={77} size={72} stroke={7} label="77% of caseload">
                <span className="text-small font-semibold">77%</span>
              </Ring>
              <Stars value={4} />
              <CapacityMeter utilisation={108} className="w-40" />
            </div>
            <div className="mt-5">
              <Stepper steps={["Received", "Intake", "Triage", "Funding", "Ready"]} current={2} />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Trend chart">
          <TrendChart
            label="Sessions"
            data={trend}
            xKey="d"
            height={200}
            series={[
              { key: "a", label: "Delivered", colour: colour.series1 },
              { key: "b", label: "Cancelled", colour: colour.series2 },
            ]}
          />
        </Panel>
        <Panel title="Bar list">
          <BarList
            label="Utilisation"
            unit="%"
            references={[{ x: 100, label: "Capacity" }]}
            data={[
              { id: "s", label: "Sarah Thompson", value: 108, colour: colour.over },
              { id: "e", label: "Emma Clarke", value: 75, colour: colour.series1 },
              { id: "d", label: "Daniel Okafor", value: 77, colour: colour.watch },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <EmptyNote
          title="No referrals waiting"
          action={<Button size="sm">Enter a referral</Button>}
        >
          New referrals appear here the moment they arrive.
        </EmptyNote>
        <ErrorNote message="Couldn't load the queue." onRetry={() => {}} />
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>

      {sheet && (
        <Sheet
          title="Session note"
          description="Mia Robinson · Wed, 11 Nov, 2:00 pm"
          onClose={() => setSheet(false)}
          footer={
            <>
              <Button>Save draft</Button>
              <Button className="ml-auto" variant="primary">
                Sign note
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <AiDraft label="AI draft" meta="from your rough notes">
              <p className="text-small text-ink-700">S: Mum reports mornings are easier…</p>
            </AiDraft>
            <TextArea label="Subjective" value="" onChange={() => {}} required />
          </div>
        </Sheet>
      )}
    </main>
  );
}
