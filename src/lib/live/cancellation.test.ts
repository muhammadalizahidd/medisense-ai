import { describe, expect, it } from "vitest";
import { classifyCancellation, noticeSummary } from "./cancellation";

const visit = new Date("2026-11-20T00:00:00Z");
const hoursBefore = (h: number, extraMs = 0) => new Date(visit.getTime() - h * 3_600_000 + extraMs);

describe("48-hour cancellation rule", () => {
  it("treats a client cancellation just under 48 hours as late", () => {
    const outcome = classifyCancellation(visit, hoursBefore(48, 60_000), "client");
    expect(outcome).toEqual({ noticeHours: 47, late: true, status: "late-cancelled" });
  });

  it("treats exactly 48 hours as enough notice", () => {
    expect(classifyCancellation(visit, hoursBefore(48), "client").late).toBe(false);
  });

  it("treats more than 48 hours as enough notice", () => {
    const outcome = classifyCancellation(visit, hoursBefore(49), "client");
    expect(outcome).toEqual({ noticeHours: 49, late: false, status: "cancelled" });
  });

  it("never charges the client when Medisense cancels", () => {
    const outcome = classifyCancellation(visit, hoursBefore(2), "medisense");
    expect(outcome.late).toBe(false);
    expect(noticeSummary(outcome, "medisense")).toContain("isn't charged");
  });

  it("never reports negative notice", () => {
    expect(classifyCancellation(visit, hoursBefore(-1), "client").noticeHours).toBe(0);
  });

  it("explains a late cancellation in plain words", () => {
    const outcome = classifyCancellation(visit, hoursBefore(12), "client");
    expect(noticeSummary(outcome, "client")).toBe(
      "Only 12 hours' notice, less than 48. This is a late cancellation and may be charged.",
    );
  });
});
