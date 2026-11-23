import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectivePermissions } from "@/lib/permissions/can";
import type { UserDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

/* The page gate: signed in, the right kind of account, and the permissions the page needs. */

let actor: UserDoc | null = null;
let failure: Error | null = null;

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("./db", () => ({
  collections: async () => ({}),
  DatabaseUnavailable: class DatabaseUnavailable extends Error {},
}));
vi.mock("./auth", () => ({
  currentUser: async () => {
    if (failure) throw failure;
    return actor;
  },
}));

const { grantPermissions } = await import("./permissions");
const { requirePageUser } = await import("./page-auth");
const { DatabaseUnavailable } = await import("./db");

const seeded = planRoleSeed([]).inserts.map((r) => ({
  slug: r.slug,
  name: r.name,
  legacyName: r.legacyName,
  permissions: r.permissions,
}));

const as = (role: UserDoc["role"], names: string[], over: Partial<UserDoc> = {}) => {
  actor = grantPermissions(
    { _id: new ObjectId(), role, staffRoles: names, ...over } as unknown as UserDoc,
    role === "admin" ? effectivePermissions(names, seeded) : [],
  );
};
const outcome = async (path: string, ...roles: UserDoc["role"][]) => {
  try {
    return await requirePageUser(path, ...roles);
  } catch (error) {
    return (error as Error).message;
  }
};

beforeEach(() => {
  actor = null;
  failure = null;
});

describe("requirePageUser", () => {
  it("lets an admin through to a page their permissions open, including its detail pages", async () => {
    as("admin", ["Finance"]);
    expect(await outcome("/care/billing", "admin")).toBe(actor);
    expect(await outcome("/care/billing/6a1f0c9e8b7d4e2a3c5b1f90", "admin")).toBe(actor);
  });

  it("sends an admin to their home when a page needs a permission they lack", async () => {
    as("admin", ["Intake Officer"]);
    expect(await outcome("/care/billing", "admin")).toBe("REDIRECT /care");
    expect(await outcome("/care/billing/6a1f0c9e8b7d4e2a3c5b1f90", "admin")).toBe("REDIRECT /care");
  });

  it("keeps the dashboard and User control for the Super Admin", async () => {
    as("admin", ["Clinical Lead"]);
    expect(await outcome("/", "admin")).toBe("REDIRECT /care");
    expect(await outcome("/care/users", "admin")).toBe("REDIRECT /care");
    as("admin", ["Super Admin", "Clinical Lead"]);
    expect(await outcome("/", "admin")).toBe(actor);
    expect(await outcome("/care/users", "admin")).toBe(actor);
  });

  it("follows permissions rather than role names", async () => {
    as("admin", ["Scheduler"]);
    expect(await outcome("/care/schedule", "admin")).toBe(actor);
    expect(await outcome("/care/funding", "admin")).toBe("REDIRECT /care");
  });

  it("opens pages that need no permission to every admin", async () => {
    as("admin", []);
    expect(await outcome("/profile", "admin")).toBe(actor);
  });

  it("still sends the wrong kind of account to its own home", async () => {
    as("therapist", []);
    expect(await outcome("/care/billing", "admin")).toBe("REDIRECT /therapist");
  });

  it("does not apply admin page permissions to a therapist on a page they may open", async () => {
    as("therapist", []);
    expect(await outcome("/care/sessions/6a1f0c9e8b7d4e2a3c5b1f90", "therapist", "admin")).toBe(
      actor,
    );
  });

  it("sends people who are not signed in, or still on a temporary password, to sign in", async () => {
    expect(await outcome("/care/billing", "admin")).toBe(
      `REDIRECT /login?next=${encodeURIComponent("/care/billing")}`,
    );
    as("admin", ["Finance"], { mustChangePassword: true });
    expect(await outcome("/care/billing", "admin")).toMatch(/^REDIRECT \/login/);
  });

  it("returns null when the database is down", async () => {
    failure = new DatabaseUnavailable("down");
    expect(await outcome("/care/billing", "admin")).toBeNull();
  });
});
