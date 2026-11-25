import { describe, expect, it } from "vitest";
import {
  Bell,
  CalendarOff,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Diamond,
  Hourglass,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { kpiIconFor } from "./kpi-icon";

describe("kpiIconFor", () => {
  it("picks an icon from the words in a label", () => {
    expect(kpiIconFor("Overdue")).toBe(TriangleAlert);
    expect(kpiIconFor("Hours worked")).toBe(Clock);
    expect(kpiIconFor("Outstanding")).toBe(Wallet);
    expect(kpiIconFor("Approved")).toBe(CircleCheck);
    expect(kpiIconFor("AI suggestions")).toBe(Diamond);
    expect(kpiIconFor("Open alerts")).toBe(Bell);
    expect(kpiIconFor("Who's away")).toBe(CalendarOff);
    expect(kpiIconFor("With supervisor")).toBe(ClipboardCheck);
    expect(kpiIconFor("Superannuation")).toBe(Wallet);
  });

  it("treats a figure that hasn't happened yet as waiting", () => {
    expect(kpiIconFor("Not submitted")).toBe(Hourglass);
    expect(kpiIconFor("Not approved")).toBe(Hourglass);
    expect(kpiIconFor("Still to sign in")).toBe(Hourglass);
  });
});
