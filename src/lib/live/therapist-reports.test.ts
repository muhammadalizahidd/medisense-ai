import { describe, expect, it } from "vitest";
import {
  blankFilters,
  emptyFacts,
  runMetric,
  scoped,
  type AppointmentFact,
  type ParticipantFact,
  type ReportFacts,
  type ServiceFact,
} from "./reports";
import { patientRows, patientSummary, populationIds, relation } from "./therapist-reports";

const today = "2026-11-14";
const clock = { today, now: "2026-11-14T02:00:00.000Z" };
const range = { from: "2026-11-01", to: "2026-11-30" };
const ctx = { ...clock, earliest: "2026-01-01" };
const filters = { ...blankFilters(today), preset: "Custom" as const, ...range };

const person = (id: string, label: string): ParticipantFact => ({
  id,
  mrn: `MRN-${id}`,
  label,
  settings: ["NDIS"],
  region: "Brisbane North",
  createdAt: "2026-01-05T00:00:00.000Z",
  dischargedAt: null,
  child: false,
  restricted: false,
});
const service = (id: string, participantId: string, p: Partial<ServiceFact> = {}): ServiceFact => ({
  id,
  referralId: null,
  participantId,
  label: "P",
  support: "Occupational Therapy",
  discipline: "Occupational Therapy",
  kind: "treatment",
  status: "assigned",
  therapistId: "t1",
  location: "Home",
  settings: ["NDIS"],
  requestedAt: "2026-02-01T00:00:00.000Z",
  startedAt: null,
  closedAt: null,
  restricted: false,
  ...p,
});
const appt = (
  id: string,
  participantId: string,
  p: Partial<AppointmentFact> = {},
): AppointmentFact => ({
  id,
  ref: `APT-${id}`,
  participantId,
  label: `Patient ${participantId}`,
  therapistId: "t1",
  discipline: "Occupational Therapy",
  support: "Occupational Therapy",
  start: "2026-11-05T01:00:00.000Z",
  status: "completed",
  mode: "Home",
  settings: ["NDIS"],
  scheduledMinutes: 60,
  deliveredMinutes: 60,
  verified: true,
  confirmed: true,
  cancelledAt: null,
  cancelReason: null,
  cancelledBy: null,
  late: false,
  movedFrom: null,
  travelBooked: 20,
  travelRecorded: 20,
  travelCharge: "Charged",
  noteStatus: "Final",
  noteDue: null,
  noteSignedAt: "2026-11-06T00:00:00.000Z",
  restricted: false,
  ...p,
});

/**
 * Anna and Ben are on the caseload; Cara was seen as cover (her service belongs to a colleague, so
 * it is not in this therapist's facts); Dev is on the caseload and was not seen; Eve's service has
 * closed but she was seen once.
 */
const facts = (): ReportFacts => ({
  ...emptyFacts(),
  participants: [
    person("a", "Anna"),
    person("b", "Ben"),
    person("c", "Cara"),
    person("d", "Dev"),
    person("e", "Eve"),
  ],
  services: [
    service("s1", "a"),
    service("s2", "b"),
    service("s4", "d", { status: "waiting" }),
    service("s5", "e", { status: "completed", closedAt: "2026-10-01T00:00:00.000Z" }),
    service("s6", "a", { id: "s6", support: "Physiotherapy", discipline: "Physiotherapy" }),
  ],
  appointments: [
    appt("1", "a"),
    appt("2", "a", { start: "2026-11-12T01:00:00.000Z", status: "no-show", verified: false }),
    appt("3", "b", { noteSignedAt: null, noteStatus: "Draft" }),
    appt("4", "c"),
    appt("5", "e"),
    appt("6", "b", { start: "2026-11-20T01:00:00.000Z", status: "booked", verified: false }),
  ],
});

const metric = (id: string, x = facts()) => runMetric(id, x, filters, ctx).value;

describe("caseload measures", () => {
  it("counts each patient once on the caseload, however many services they have", () => {
    expect(metric("caseload")).toBe(3);
  });

  it("does not count a closed service", () => {
    expect(populationIds(facts(), range.from, range.to, today, "caseload").ids.has("e")).toBe(
      false,
    );
  });

  it("counts the patients seen, delivered sessions only", () => {
    expect(metric("patients-seen")).toBe(4);
  });

  it("separates those on the caseload who were not seen", () => {
    expect(metric("caseload-not-seen")).toBe(1);
  });

  it("separates those seen who are not on the caseload", () => {
    expect(metric("seen-off-caseload")).toBe(2);
  });

  it("finds patients not seen in the last 30 days", () => {
    expect(metric("quiet-patients")).toBe(1);
  });

  it("has an attendance rate that counts a missed visit against the patient", () => {
    // Three delivered (a, b, c, e → 4 delivered), one did not attend: 4 ÷ 5.
    expect(metric("attendance-rate")).toBe(80);
  });

  it("gives N/A, never zero, when nothing was due", () => {
    expect(metric("attendance-rate", emptyFacts())).toBeNull();
  });

  it("agrees across the caseload, the unseen and the seen counts", () => {
    const seen = metric("patients-seen") as number;
    const off = metric("seen-off-caseload") as number;
    const unseen = metric("caseload-not-seen") as number;
    expect(metric("caseload")).toBe(unseen + (seen - off));
  });
});

describe("patient lists", () => {
  const rows = (population: "caseload" | "seen" | "both") =>
    patientRows(facts(), range, clock, population);

  it("lists the caseload, the seen, or both, never a patient twice", () => {
    expect(rows("caseload").map((r) => r.name)).toEqual(["Anna", "Ben", "Dev"]);
    expect(rows("seen").map((r) => r.name)).toEqual(["Anna", "Ben", "Cara", "Eve"]);
    expect(rows("both").map((r) => r.name)).toEqual(["Anna", "Ben", "Cara", "Dev", "Eve"]);
  });

  it("describes how each patient relates to the therapist", () => {
    const by = Object.fromEntries(rows("both").map((r) => [r.name, relation(r)]));
    expect(by).toEqual({
      Anna: "On caseload",
      Ben: "On caseload",
      Cara: "Seen, not on caseload",
      Dev: "On caseload, not seen",
      Eve: "Seen, not on caseload",
    });
  });

  it("works out sessions, attendance, last seen and the next visit", () => {
    const anna = rows("both").find((r) => r.name === "Anna");
    expect(anna).toMatchObject({
      sessions: 1,
      attendance: 50,
      lastSeen: "2026-11-05",
      disciplines: ["Occupational Therapy", "Physiotherapy"],
    });
    expect(rows("both").find((r) => r.name === "Ben")?.nextVisit).toBe("2026-11-20");
  });

  it("counts notes still to sign", () => {
    expect(rows("both").find((r) => r.name === "Ben")?.notesToSign).toBe(1);
    expect(rows("both").find((r) => r.name === "Anna")?.notesToSign).toBe(0);
  });

  it("gives a patient with nothing in the period no attendance figure", () => {
    expect(rows("caseload").find((r) => r.name === "Dev")?.attendance).toBeNull();
  });

  it("returns nothing for a therapist with no patients", () => {
    expect(patientRows(emptyFacts(), range, clock, "both")).toEqual([]);
  });
});

describe("patient filter", () => {
  it("narrows appointments, services and participants to the chosen patient", () => {
    const out = scoped(facts(), { ...filters, patient: "a" }, new Map());
    expect(out.participants.map((p) => p.id)).toEqual(["a"]);
    expect(new Set(out.appointments.map((a) => a.participantId))).toEqual(new Set(["a"]));
    expect(new Set(out.services.map((s) => s.participantId))).toEqual(new Set(["a"]));
  });

  it("changes the numbers every tile reads", () => {
    const out = scoped(facts(), { ...filters, patient: "b" }, new Map());
    expect(runMetric("patients-seen", out, filters, ctx).value).toBe(1);
  });

  it("shows everyone when no patient is chosen", () => {
    expect(scoped(facts(), filters, new Map()).participants).toHaveLength(5);
  });
});

describe("patient summary", () => {
  it("collects one patient's recent sessions and services", () => {
    const s = patientSummary(facts(), "a", range, clock);
    expect(s?.row.name).toBe("Anna");
    expect(s?.recent).toHaveLength(2);
    expect(s?.services).toHaveLength(2);
  });

  it("returns nothing for someone who is not in the facts", () => {
    expect(patientSummary(facts(), "zzz", range, clock)).toBeNull();
  });
});
