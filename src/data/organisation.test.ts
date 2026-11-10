import { describe, expect, it } from "vitest";
import { clientTotals } from "./client-directory";
import { allScope, clinicians } from "./clinicians";
import { summarise } from "./organisation";

const kpi = (label: string) => summarise(allScope).kpis.find((k) => k.label === label)?.value;

describe("organisation figures", () => {
  it("has 20 clinicians across all nine disciplines", () => {
    expect(clinicians).toHaveLength(20);
    expect(new Set(clinicians.map((c) => c.discipline)).size).toBe(9);
  });

  it("counts 293 active clients, the same in the directory and the KPIs", () => {
    expect(clientTotals.all).toBe(293);
    expect(clientTotals.ndis + clientTotals.agedCare).toBe(293);
    expect(kpi("Active clients")).toBe("293");
  });

  it("keeps the agreed backlog figures", () => {
    expect(kpi("Notes due")).toBe("17");
    expect(kpi("Follow-ups overdue")).toBe("11");
    expect(kpi("Supervision due")).toBe("4");
    expect(kpi("Clinicians near capacity")).toBe("3");
    expect(kpi("Clients requiring review")).toBe("14");
  });

  it("keeps Sarah At Risk with 27 clients", () => {
    const sarah = clinicians.find((c) => c.id === "sarah-thompson");
    expect(sarah?.active).toBe(27);
    expect(sarah?.status).toBe("at-risk");
  });
});
