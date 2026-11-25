import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SessionStats } from "@/lib/live/patient-stats";
import type { RecordDto } from "@/lib/live/records";
import {
  BarChart,
  Callout,
  DataTable,
  Doc,
  DocPage,
  Section,
  StatTiles,
  TitleBlock,
  space,
} from "../components";
import { pdfColour as c, pdfSize as size } from "../theme";

/*
 * A patient summary a therapist can read before a visit: safety first, then how attendance is
 * going, what is being worked on, and the latest notes. Every list is capped and long text is
 * shortened so it stays within two pages. Documents are downloaded separately.
 */

const s = StyleSheet.create({
  cols: { flexDirection: "row", gap: space.xl },
  col: { flex: 1, minWidth: 0 },
  item: { marginBottom: 5 },
  strong: { fontSize: size.small, fontWeight: 600, lineHeight: 1.3 },
  meta: { fontSize: size.tiny, color: c.ink500, lineHeight: 1.3 },
  none: { fontSize: size.small, color: c.ink500 },
});

/** Shortens text at a word boundary, so nothing is cut mid-word. */
const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, "")}…`;
};

const day = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Brisbane",
      }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+10:00` : iso))
    : "—";

/** A short list: the first few entries, then how many more there are. */
function List({
  items,
  max,
  empty,
}: {
  items: { title: string; detail?: string }[];
  max: number;
  empty: string;
}) {
  if (!items.length) return <Text style={s.none}>{empty}</Text>;
  return (
    <View>
      {items.slice(0, max).map((x, i) => (
        <View key={i} style={s.item} wrap={false}>
          <Text style={s.strong}>{clip(x.title, 80)}</Text>
          {x.detail ? <Text style={s.meta}>{clip(x.detail, 130)}</Text> : null}
        </View>
      ))}
      {items.length > max && (
        <Text style={s.meta}>and {items.length - max} more in the record</Text>
      )}
    </View>
  );
}

export function PatientReportDocument({
  r,
  stats,
  preparedBy,
  preparedAt,
}: {
  r: RecordDto;
  stats: SessionStats;
  preparedBy: string;
  preparedAt: string;
}) {
  const risks = r.risks.map((x) => ({
    title: `${x.severity}: ${x.description}`,
    detail: x.mitigation ? `Plan: ${x.mitigation}` : undefined,
  }));
  const allergies = r.allergies.map((a) => ({
    title: a.substance,
    detail: [a.reaction, a.severity].filter(Boolean).join(" · "),
  }));
  const health = [
    ...r.conditions.map((x) => ({ title: x.label, detail: x.status })),
    ...r.medications.map((m) => ({
      title: `${m.name} ${m.strength}`.trim(),
      detail: [m.frequency, m.indication].filter(Boolean).join(" · "),
    })),
  ];
  const notes = r.entries
    .filter((e) => !e.hidden && e.status !== "Voided")
    .map((e) => ({
      title: `${day(e.createdAt)} · ${e.title}${e.status === "Draft" ? " (draft)" : ""}`,
      detail: e.text,
    }));
  const people = [
    ...r.careTeam.contacts.map((x) => ({
      title: x.name,
      detail: [x.relationship || x.role, x.contactAllowed ? "May be contacted" : "Do not contact"]
        .filter(Boolean)
        .join(" · "),
    })),
    ...r.careTeam.clinicians.map((x) => ({ title: x.name, detail: x.discipline })),
  ];
  return (
    <Doc title={`Patient summary: ${r.name}`} author={preparedBy}>
      <DocPage kind="Patient summary" footer={`${r.name} · Confidential patient information`}>
        <TitleBlock
          title={r.name}
          subtitle={[
            r.dateOfBirth ? `Born ${day(r.dateOfBirth)}` : null,
            r.pronouns,
            r.suburb,
            r.funding,
            `Prepared by ${preparedBy}, ${day(preparedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        {r.precautions ? (
          <Callout tone="alert" title="Precaution">
            {clip(r.precautions, 260)}
          </Callout>
        ) : null}
        {r.alerts.length > 0 && (
          <Callout tone="watch" title="Alerts">
            {clip(r.alerts.map((a) => a.text).join(" · "), 220)}
          </Callout>
        )}
        <StatTiles
          tiles={[
            { label: "Sessions delivered", value: String(stats.delivered) },
            {
              label: "Attendance",
              value: stats.attendance === null ? "N/A" : `${stats.attendance}%`,
            },
            { label: "Last visit", value: day(stats.last) },
            { label: "Next visit", value: day(stats.next) },
          ]}
        />
        {/* Safety first: allergies and risks sit together on the first page. */}
        <View style={s.cols} wrap={false}>
          <View style={s.col}>
            <Section title="Allergies">
              <List items={allergies} max={3} empty="No allergies recorded." />
            </Section>
          </View>
          <View style={s.col}>
            <Section title="Risks">
              <List items={risks} max={3} empty="No risks recorded." />
            </Section>
          </View>
        </View>
        <View style={s.cols} wrap={false}>
          <View style={s.col}>
            <Section title="Sessions, last 6 months">
              <BarChart
                data={stats.months.map((m) => ({ label: m.label.slice(0, 3), value: m.value }))}
                labelWidth={40}
              />
            </Section>
          </View>
          <View style={s.col}>
            <Section title="Attendance">
              <BarChart
                labelWidth={64}
                data={[
                  { label: "Delivered", value: stats.delivered, colour: c.accent },
                  { label: "Missed", value: stats.missed, colour: c.watch },
                  { label: "Cancelled", value: stats.cancelled, colour: c.borderStrong },
                ]}
              />
            </Section>
          </View>
        </View>
        <Section title="Goals">
          {r.goals.length ? (
            <DataTable
              columns={[
                { key: "goal", label: "Goal", align: "left", flex: 3 },
                { key: "now", label: "Now", align: "left", flex: 2 },
                { key: "target", label: "Target", align: "left", flex: 2 },
                { key: "status", label: "Status", align: "left", flex: 1 },
              ]}
              rows={r.goals.slice(0, 5).map((g) => ({
                goal: clip(g.description, 110),
                now: clip(g.current || "—", 70),
                target: clip(g.target || "—", 70),
                status: g.status,
              }))}
            />
          ) : (
            <Text style={s.none}>No goals recorded.</Text>
          )}
        </Section>
        <View style={s.cols} wrap={false}>
          <View style={s.col}>
            <Section title="Conditions and medicines">
              <List items={health} max={4} empty="Nothing recorded." />
            </Section>
          </View>
          <View style={s.col}>
            <Section title="Services">
              <List
                items={r.episodes.map((e) => ({
                  title: e.support,
                  detail: [e.status, e.clinician].filter(Boolean).join(" · "),
                }))}
                max={4}
                empty="No services recorded."
              />
            </Section>
          </View>
        </View>
        <Section title="Latest notes">
          <List items={notes} max={3} empty="No notes recorded." />
        </Section>
        <Section title="People">
          <List items={people} max={4} empty="No contacts recorded." />
        </Section>
      </DocPage>
    </Doc>
  );
}
