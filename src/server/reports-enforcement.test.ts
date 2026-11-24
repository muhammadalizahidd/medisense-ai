import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCollection, type Doc } from "@/test/fake-collection";
import type { RoleDoc, UserDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

/* The scope a signed-in person gets in reports follows the roles in the roles collection. */

const db = { roles: new FakeCollection() };
vi.mock("./db", () => ({ collections: async () => db }));
vi.mock("./log", () => ({ serverLog: () => undefined }));

const { loadPermissions } = await import("./permissions");
const { reportScope } = await import("./reports");

const as = (role: UserDoc["role"], ...names: string[]) =>
  loadPermissions({ role, staffRoles: names } as unknown as UserDoc);
const role = (slug: string) => db.roles.docs.find((r) => r.slug === slug) as unknown as RoleDoc;

beforeEach(() => {
  db.roles.docs = planRoleSeed([]).inserts as unknown as Doc[];
});

describe("reportScope", () => {
  it("gives Finance the finance domain only", async () => {
    const scope = reportScope(await as("admin", "Finance"));
    expect(scope.domains).toEqual(["Finance"]);
    expect(scope.share).toEqual(["Private", "Team"]);
    expect(scope.schedule).toBe(false);
  });

  it("gives the Operations Manager organisation-wide sharing and scheduling", async () => {
    const scope = reportScope(await as("admin", "Operations Manager"));
    expect(scope.share).toEqual(["Private", "Team", "Organisation"]);
    expect(scope.schedule).toBe(true);
    expect(scope.clinicalDetail).toBe(false);
  });

  it("gives a Clinical Lead clinical row-level detail", async () => {
    const scope = reportScope(await as("admin", "Clinical Lead"));
    expect(scope.clinicalDetail).toBe(true);
    expect(scope.detail).toContain("Clinical Operations");
  });

  it("applies a change to a role on the next request", async () => {
    role("finance").permissions = role("finance").permissions.filter(
      (id) => id !== "reports.read.finance",
    );
    expect(reportScope(await as("admin", "Finance")).domains).toEqual([]);
  });

  it("gives a custom role the domains it names", async () => {
    db.roles.docs.push({
      slug: "auditor",
      name: "Auditor",
      builtIn: false,
      permissions: ["app.admin", "reports.read.audit", "reports.detail.audit"],
    });
    const scope = reportScope(await as("admin", "auditor"));
    expect(scope.domains).toEqual(["Audit"]);
    expect(scope.detail).toEqual(["Audit"]);
  });

  it("keeps the fixed scope for a therapist, whatever roles they carry", async () => {
    const scope = reportScope(await as("therapist", "Finance"));
    expect(scope.label).toBe("Therapist (own caseload)");
    expect(scope.domains).not.toContain("Finance");
  });
});
