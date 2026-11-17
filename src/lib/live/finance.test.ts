import { describe, expect, it } from "vitest";
import {
  ageingOf,
  cancellationDecision,
  DEFAULT_RULES,
  lineMoney,
  presetRange,
  quantityFor,
} from "./finance";

describe("Module 07 money", () => {
  it("multiplies quantity by rate to the cent, with GST only when taxable (AC-13, AC-14)", () => {
    expect(lineMoney(1, 193.99, "GST-free")).toEqual({ subtotal: 193.99, gst: 0, total: 193.99 });
    expect(lineMoney(0.75, 193.99, "GST-free").subtotal).toBe(145.49);
    expect(lineMoney(18, 0.99, "Taxable")).toEqual({ subtotal: 17.82, gst: 1.78, total: 19.6 });
  });

  it("derives quantity from delivered minutes for hourly units", () => {
    expect(quantityFor("Hour", 60)).toBe(1);
    expect(quantityFor("Hour", 45)).toBe(0.75);
    expect(quantityFor("Km", 45, 18)).toBe(18);
  });

  it("buckets ageing by days past due; a paid or credit balance is never overdue (AC-28)", () => {
    expect(ageingOf("2026-11-20", "2026-11-14", 100)).toBe("Current");
    expect(ageingOf("2026-11-01", "2026-11-14", 100)).toBe("1–30 days");
    expect(ageingOf("2026-10-01", "2026-11-14", 100)).toBe("31–60 days");
    expect(ageingOf("2026-06-01", "2026-11-14", 100)).toBe("90+ days");
    expect(ageingOf("2026-06-01", "2026-11-14", 0)).toBeNull();
    expect(ageingOf("2026-06-01", "2026-11-14", -20)).toBeNull();
  });

  it("uses the 1 July financial year", () => {
    expect(presetRange("This Financial Year", "2026-11-14")).toEqual({
      from: "2026-07-01",
      to: "2027-06-30",
    });
    expect(presetRange("Last Month", "2026-11-14")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });
});

describe("S05 cancellation rules (AC-16)", () => {
  it("waives a cancellation where the path doesn't allow charging", () => {
    const d = cancellationDecision(DEFAULT_RULES.paths.Insurer, 2, 60, 1);
    expect(d.charge).toBe(false);
    expect(d.note).toMatch(/Waived/);
  });
  it("waives when enough notice was given", () => {
    expect(cancellationDecision(DEFAULT_RULES.paths["Plan Managed"], 72, 60, 1).charge).toBe(false);
  });
  it("charges the configured share for short notice", () => {
    expect(cancellationDecision(DEFAULT_RULES.paths["Plan Managed"], 4, 60, 1)).toMatchObject({
      charge: true,
      minutes: 60,
    });
    expect(cancellationDecision(DEFAULT_RULES.paths.Private, 4, 60, 1)).toMatchObject({
      charge: true,
      minutes: 30,
    });
  });
});
