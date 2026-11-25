import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ReferralsModule from "@/server/referrals";
import type { UserDoc } from "@/server/models";

/*
 * The referral routes: intake work needs referrals.process, the triage decision is left to its own
 * permission inside referralAction, and reading a referral needs one of the two.
 */

let actor: UserDoc;
const referralAction = vi.fn(async () => ({ ok: true }));
const referralDetail = vi.fn(async () => ({ id: "r" }));

vi.mock("@/server/db", () => ({ collections: async () => ({}) }));
vi.mock("@/server/auth", async () => ({
  AuthError: (await import("@/server/auth-error")).AuthError,
  requireUser: async () => actor,
}));
vi.mock("@/server/referrals", async (original) => ({
  ...(await original<typeof ReferralsModule>()),
  referralAction: (...args: unknown[]) => referralAction(...(args as [])),
  referralDetail: (...args: unknown[]) => referralDetail(...(args as [])),
}));

const { GET, POST } = await import("./route");
const { grantPermissions } = await import("@/server/permissions");
const { planRoleSeed } = await import("@/server/roles-seed");
const { effectivePermissions } = await import("@/lib/permissions/can");

const seeded = planRoleSeed([]).inserts.map((r) => ({
  slug: r.slug,
  name: r.name,
  legacyName: r.legacyName,
  permissions: r.permissions,
}));
const as = (...names: string[]) => {
  actor = grantPermissions(
    { _id: new ObjectId(), role: "admin", staffRoles: names } as unknown as UserDoc,
    effectivePermissions(names, seeded),
  );
};

const id = new ObjectId().toHexString();
const ctx = { params: Promise.resolve({ id }) };
const post = (body: unknown) =>
  POST(new Request("http://x.test/api", { method: "POST", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  referralAction.mockClear();
  referralDetail.mockClear();
});

describe("POST /api/care/referrals/[id]", () => {
  it("lets intake work through for roles holding referrals.process", async () => {
    as("Intake Officer");
    const res = await post({ type: "take-ownership" });
    expect(res.status).toBe(200);
    expect(referralAction).toHaveBeenCalledTimes(1);
  });

  it("refuses intake work for a role without it, before anything runs", async () => {
    as("Scheduler");
    const res = await post({ type: "take-ownership" });
    expect(res.status).toBe(403);
    expect(referralAction).not.toHaveBeenCalled();
  });

  it("passes a triage decision on to referralAction, which checks referrals.triage itself", async () => {
    as("Clinical Lead");
    expect(
      (
        await post({
          type: "triage",
          decision: "Declined",
          notes: "Reviewed.",
          riskAction: "",
          precaution: "",
        })
      ).status,
    ).not.toBe(403);
    expect(referralAction).toHaveBeenCalledTimes(1);
  });

  it("lets the Super Admin do everything", async () => {
    as("Super Admin");
    expect((await post({ type: "take-ownership" })).status).toBe(200);
  });
});

describe("GET /api/care/referrals/[id]", () => {
  it("opens for intake and for clinical leads", async () => {
    as("Intake Officer");
    expect((await GET(new Request("http://x.test/api"), ctx)).status).toBe(200);
    as("Clinical Lead");
    expect((await GET(new Request("http://x.test/api"), ctx)).status).toBe(200);
  });

  it("is closed to roles with neither permission", async () => {
    as("Finance");
    expect((await GET(new Request("http://x.test/api"), ctx)).status).toBe(403);
    expect(referralDetail).not.toHaveBeenCalled();
  });
});
