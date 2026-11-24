import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFacts } from "@/lib/live/reports";
import type { UserDoc } from "./models";

/* Who may open whose reports, and that opening another therapist's is audited. */

const emma = new ObjectId();
const sarah = new ObjectId();
const auditLog: string[] = [];
const loadFacts = vi.fn(async () => ({
  scope: {
    label: "Therapist report",
    domains: [],
    detail: [],
    clinicalDetail: false,
    share: [],
    schedule: false,
    teams: [],
  },
  facts: emptyFacts(),
  names: {},
  today: "2026-11-14",
  now: "2026-11-14T02:00:00.000Z",
  earliest: "2026-07-01",
  latest: "2026-11-14",
  freshness: "2026-11-14T02:00:00.000Z",
  settings: { thresholds: {}, deadlines: { noteDueHours: 48, reportDueDays: 21 }, history: [] },
}));

vi.mock("./db", () => ({
  collections: async () => ({
    therapists: {
      findOne: async ({ _id }: { _id: ObjectId }) =>
        _id.equals(emma)
          ? { name: "Emma Clarke", discipline: "Occupational Therapy", region: "Brisbane North" }
          : null,
    },
  }),
}));
vi.mock("./live", () => ({
  audit: async (_: unknown, action: string) => {
    auditLog.push(action);
  },
}));
vi.mock("./reports", () => ({ loadFacts }));
vi.mock("./log", () => ({ serverLog: () => undefined }));
vi.mock("./auth", () => {
  class AuthError extends Error {
    constructor(readonly status: 401 | 403) {
      super("You don't have access to this.");
    }
  }
  return { AuthError };
});

const { therapistHub } = await import("./therapist-reports");
const { grantPermissions } = await import("./permissions");
const { AuthError } = await import("./auth");

const therapist = (id: ObjectId | null) =>
  ({
    _id: new ObjectId(),
    name: "Emma",
    role: "therapist",
    staffRoles: [],
    therapistId: id,
  }) as unknown as UserDoc;
const admin = (...held: string[]) =>
  grantPermissions(
    {
      _id: new ObjectId(),
      name: "Jo Marsh",
      role: "admin",
      staffRoles: ["Scheduler"],
    } as unknown as UserDoc,
    held,
  );

beforeEach(() => {
  auditLog.length = 0;
  loadFacts.mockClear();
});

describe("a therapist's own reports", () => {
  it("loads for the therapist themself, with no audit entry", async () => {
    const dto = await therapistHub(therapist(emma));
    expect(dto.self).toBe(true);
    expect(dto.subject.name).toBe("Emma Clarke");
    expect(auditLog).toEqual([]);
  });

  it("refuses to load another therapist's reports", async () => {
    await expect(therapistHub(therapist(emma), sarah)).rejects.toBeInstanceOf(AuthError);
    expect(loadFacts).not.toHaveBeenCalled();
  });

  it("is a 404 for an account with no therapist record", async () => {
    await expect(therapistHub(therapist(null))).rejects.toThrow(/No therapist record/);
  });
});

describe("an admin looking at a therapist's reports", () => {
  it("is refused without the permission", async () => {
    await expect(therapistHub(admin(), emma)).rejects.toBeInstanceOf(AuthError);
    expect(loadFacts).not.toHaveBeenCalled();
  });

  it("loads that therapist's facts, and audits the access", async () => {
    const dto = await therapistHub(admin("reports.therapist"), emma);
    expect(dto.self).toBe(false);
    expect(loadFacts).toHaveBeenCalledWith(expect.anything(), { therapistId: emma });
    expect(auditLog).toEqual(["Therapist reports: opened Emma Clarke"]);
  });

  it("asks which therapist when none is chosen", async () => {
    await expect(therapistHub(admin("reports.therapist"))).rejects.toThrow(/Choose a therapist/);
  });

  it("is a 404 for a therapist who does not exist, and writes no audit entry", async () => {
    await expect(therapistHub(admin("reports.therapist"), sarah)).rejects.toThrow(/not found/);
    expect(auditLog).toEqual([]);
  });
});
