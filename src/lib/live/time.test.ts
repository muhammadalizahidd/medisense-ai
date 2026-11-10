import { describe, expect, it } from "vitest";
import { safeNext } from "./routes";
import { ageFrom, atBrisbane, brisbaneDay, brisbaneMinutes, isoWeekday } from "./time";

describe("Brisbane time", () => {
  it("puts 9 am Brisbane at 11 pm UTC the day before", () => {
    const day = new Date(Date.UTC(2026, 10, 11));
    expect(atBrisbane(day, 9 * 60).toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });

  it("finds the Brisbane day of a late-evening UTC instant", () => {
    expect(brisbaneDay(new Date("2026-11-10T23:30:00Z")).toISOString()).toBe(
      "2026-11-11T00:00:00.000Z",
    );
  });

  it("round-trips minutes after midnight", () => {
    const day = new Date(Date.UTC(2026, 10, 11));
    expect(brisbaneMinutes(atBrisbane(day, 13 * 60 + 30))).toBe(13 * 60 + 30);
  });

  it("numbers weekdays from Monday", () => {
    expect(isoWeekday(new Date(Date.UTC(2026, 10, 9)))).toBe(1);
    expect(isoWeekday(new Date(Date.UTC(2026, 10, 15)))).toBe(7);
  });

  it("works out age before and after a birthday", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(ageFrom("2020-11-10", now)).toBe(6);
    expect(ageFrom("2020-11-11", now)).toBe(5);
    expect(ageFrom(null, now)).toBeNull();
  });
});

describe("return path after sign-in", () => {
  it("accepts same-site paths only", () => {
    expect(safeNext("/care")).toBe("/care");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext(String.raw`/\evil.example`)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
});
