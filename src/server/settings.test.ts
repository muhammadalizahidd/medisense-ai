import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCollection } from "@/test/fake-collection";
import type { UserDoc } from "./models";

const settings = new FakeCollection();
const auditLog: string[] = [];
const published: { to: number; type: string; payload: unknown }[] = [];
const everyone = [new ObjectId(), new ObjectId(), new ObjectId()];

vi.mock("./db", () => ({ collections: async () => ({ db: { collection: () => settings } }) }));
vi.mock("./live", () => ({
  adminIds: async () => [],
  allUserIds: async () => everyone,
  audit: async (_me: unknown, action: string) => {
    auditLog.push(action);
  },
  publish: async (ids: unknown[], type: string, payload: unknown) => {
    published.push({ to: ids.length, type, payload });
  },
}));
vi.mock("./user-control", async () => {
  const { AuthError } = await import("./auth-error");
  const isSuper = (u: UserDoc) => (u.staffRoles ?? []).includes("Super Admin" as never);
  return {
    isSuper,
    requireSuperAdmin: (u: UserDoc) => {
      if (!isSuper(u)) throw new AuthError(403);
    },
  };
});

const { orgSettings, setAiEnabled, setAssignmentMode } = await import("./settings");
const { AuthError } = await import("./auth-error");

const admin = (staffRoles: string[]) =>
  ({ _id: new ObjectId(), name: "Neil", role: "admin", staffRoles }) as unknown as UserDoc;

describe("organisation AI switch setting", () => {
  beforeEach(() => {
    settings.docs = [];
    auditLog.length = 0;
    published.length = 0;
  });

  it("is on until someone turns it off", async () => {
    expect((await orgSettings()).aiEnabled).toBe(true);
  });

  it("can only be changed by the Super Admin", async () => {
    await expect(setAiEnabled(admin(["Operations Manager"]), false)).rejects.toBeInstanceOf(
      AuthError,
    );
    expect(settings.docs).toEqual([]);
    expect(published).toEqual([]);
  });

  it("saves, audits and tells everyone", async () => {
    const result = await setAiEnabled(admin(["Super Admin"]), false);
    expect(result.enabled).toBe(false);
    expect(result.updatedBy).toBe("Neil");
    expect(auditLog).toEqual(["AI features turned off"]);
    expect(published[0]).toEqual({ to: 3, type: "settings", payload: { aiEnabled: false } });
  });

  it("falls back to Manual assignment while off, and restores the choice", async () => {
    const owner = admin(["Super Admin"]);
    await setAiEnabled(owner, false);
    expect((await orgSettings()).assignmentMode).toBe("Manual");
    await expect(setAssignmentMode(owner, "AI Assisted")).rejects.toThrow(/turned off/);
    await setAiEnabled(owner, true);
    expect((await orgSettings()).assignmentMode).toBe("AI Assisted");
  });
});
