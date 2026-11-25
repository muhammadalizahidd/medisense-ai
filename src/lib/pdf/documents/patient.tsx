import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SessionStats } from "@/lib/live/patient-stats";
import type { RecordDto } from "@/lib/live/records";
import { Callout, DataTable, Doc, DocPage, Section, StatTiles, TitleBlock } from "../components";
import { pdfColour as c, pdfSize as size } from "../theme";

/*
 * A patient summary a therapist can read before a visit: safety first, then how attendance is
 * going, what is being worked on, and the latest notes. Every list is capped and long text is
 * shortened so it stays within two pages. Documents are downloaded separately.
 */

const s = StyleSheet.create({
  cols: { flexDirection: "row", gap: 20 },
  col: { flex: 1, minWidth: 0 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  barLabel: { width: 58, fontSize: size.small, color: c.ink700 },
  barTrack: { flex: 1, height: 7, backgroundColor: c.mintSoft, borderRadius: 2 },
  bar: { height: 7, borderRadius: 2, backgroundColor: c.accent },
  barValue: { width: 22, textAlign: "right", fontSize: size.small, fontWeight: 600 },
  item: { marginBottom: 4 },
  strong: { fontSize: size.small, fontWeight: 600, lineHeight: 1.3 },
  meta: { fontSize: size.tiny, color: c.ink500, lineHeight: 1.3 },
  none: { fontSize: size.small, color: c.ink500 },
});

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
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

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const top = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      {data.map((d) => (
        <View key={d.label} style={s.barRow}>
          <Text style={s.barLabel}>{d.label}</Text>
          <View style={s.barTrack}>
            {d.value > 0 && <View style={[s.bar, { width: `${(d.value / top) * 100}%` }]} />}
          </View>
          <Text style={s.barValue}>{d.value}</Text>
        </View>
      ))}
    </View>
  );
}

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
        <View style={{ marginTop: 8 }}>
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
        </View>
        <View style={s.cols}>
          <View style={s.col}>
            <Section title="Sessions, last 6 months">
              <Bars data={stats.months} />
            </Section>
          </View>
          <View style={s.col}>
            <Section title="Attendance">
              <Bars
                data={[
                  { label: "Delivered", value: stats.delivered },
                  { label: "Missed", value: stats.missed },
                  { label: "Cancelled", value: stats.cancelled },
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
                { key: "now", label: "Now", align: "left" },
                { key: "target", label: "Target", align: "left" },
                { key: "status", label: "Status", align: "left" },
              ]}
              rows={r.goals.slice(0, 5).map((g) => ({
                goal: clip(g.description, 100),
                now: clip(g.current || "—", 36),
                target: clip(g.target || "—", 36),
                status: g.status,
              }))}
            />
          ) : (
            <Text style={s.none}>No goals recorded.</Text>
          )}
        </Section>
        <View style={s.cols}>
          <View style={s.col}>
            <Section title="Risks">
              <List items={risks} max={4} empty="No risks recorded." />
            </Section>
            <Section title="Allergies">
              <List items={allergies} max={3} empty="No allergies recorded." />
            </Section>
          </View>
          <View style={s.col}>
            <Section title="Conditions and medicines">
              <List items={health} max={5} empty="Nothing recorded." />
            </Section>
            <Section title="Services">
              <List
                items={r.episodes.map((e) => ({
                  title: e.support,
                  detail: [e.status, e.clinician].filter(Boolean).join(" · "),
                }))}
                max={3}
                empty="No services recorded."
              />
            </Section>
          </View>
        </View>
        <Section title="Latest notes">
          <List items={notes} max={3} empty="No notes recorded." />
        </Section>
        <Section title="People">
          <List items={people} max={3} empty="No contacts recorded." />
        </Section>
      </DocPage>
    </Doc>
  );
}
