import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { addDays, brisbaneDay, brisbaneMinutes, isoWeekday } from "@/lib/live/time";
import { availabilitySummary, isAway, openSlots, rankTherapists } from "./matching";
import type { TherapistDoc } from "./models";

const key = (d: Date) => brisbaneDay(d).toISOString().slice(0, 10);
const tomorrow = addDays(brisbaneDay(new Date()), 1);

const therapist = (over: Partial<TherapistDoc> = {}): TherapistDoc => ({
  _id: new ObjectId(),
  slug: "test-therapist",
  name: "Test Therapist",
  discipline: "Occupational Therapy",
  region: "Brisbane North",
  seniority: "Clinician",
  capacity: 24,
  activeClients: 12,
  caseloadScore: 30,
  sessionMinutes: 60,
  weekly: [1, 3, 4].map((weekday) => ({ weekday, start: 540, end: 900 })),
  timeOff: [],
  userId: new ObjectId(),
  ...over,
});

describe("availability in matching", () => {
  it("only offers times on working days and inside the therapist's hours", () => {
    const slots = openSlots(therapist(), [], { limit: 12, perDay: 3 });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect([1, 3, 4]).toContain(isoWeekday(brisbaneDay(s)));
      expect(brisbaneMinutes(s)).toBeGreaterThanOrEqual(540);
      expect(brisbaneMinutes(s) + 60).toBeLessThanOrEqual(900);
    }
  });

  it("offers nothing during time off", () => {
    const off = { id: "a", from: key(tomorrow), to: key(addDays(tomorrow, 6)), reason: "Leave" };
    const t = therapist({ timeOff: [off] });
    expect(isAway(t, addDays(tomorrow, 2))).toBe(true);
    for (const s of openSlots(t, [], { limit: 12, perDay: 3 })) {
      expect(key(s) > off.to).toBe(true);
    }
  });

  it("describes the working pattern and upcoming leave in words", () => {
    const off = {
      id: "a",
      from: key(addDays(tomorrow, 2)),
      to: key(addDays(tomorrow, 3)),
      reason: "Leave",
    };
    const summary = availabilitySummary(therapist({ timeOff: [off] }));
    expect(summary.pattern).toBe("Mon, Wed, Thu · 9 am–3 pm");
    expect(summary.away).toHaveLength(1);
  });

  it("ranks without throwing and returns availability with every match", () => {
    const ranked = rankTherapists(
      [therapist(), therapist({ slug: "b", caseloadScore: 85 })],
      new Map(),
      "Brisbane North",
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.status).toBe("Healthy");
    expect(ranked.every((m) => m.availability.pattern.length > 0)).toBe(true);
  });
});
