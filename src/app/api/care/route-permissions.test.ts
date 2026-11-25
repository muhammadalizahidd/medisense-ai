import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { effectivePermissions } from "@/lib/permissions/can";
import { builtInRoles, defaultPermissionsFor } from "@/lib/permissions/catalogue";
import type { UserDoc } from "@/server/models";

/*
 * Route guards: each route that moved to the central check refuses a role whose permission it
 * lacks, before anything runs, and lets the roles that hold it through. The expectation comes from
 * the catalogue defaults, so changing a default (or a guard) fails here.
 *
 * "Let through" means the guard did not answer 403. The database is empty in this test, so an
 * allowed request may fail later for other reasons; only the 403 matters.
 */

let actor: UserDoc;

vi.mock("@/server/db", () => ({
  collections: async () => ({}),
  DatabaseUnavailable: class DatabaseUnavailable extends Error {},
}));
vi.mock("@/server/auth", async () => ({
  AuthError: (await import("@/server/auth-error")).AuthError,
  requireUser: async () => actor,
}));
vi.mock("@/server/log", () => ({ serverLog: () => undefined }));

const { grantPermissions } = await import("@/server/permissions");
const { planRoleSeed } = await import("@/server/roles-seed");

const seeded = planRoleSeed([]).inserts.map((r) => ({
  slug: r.slug,
  name: r.name,
  legacyName: r.legacyName,
  permissions: r.permissions,
}));

const as = (name: string) => {
  actor = grantPermissions(
    { _id: new ObjectId(), role: "admin", staffRoles: [name] } as unknown as UserDoc,
    effectivePermissions([name], seeded),
  );
};

const id = new ObjectId().toHexString();
const ctx = { params: Promise.resolve({ id, clientId: id }) };
const json = (method: string, body: unknown = {}) =>
  new Request("http://x.test/api", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });

type Handler = (request: Request, context: typeof ctx) => Promise<Response> | Response;

/** Runs a handler. A route with no error wrapper may throw once past the guard: that counts as allowed. */
const run = (handler: Handler, method: string) =>
  Promise.resolve()
    .then(() => handler(json(method), ctx))
    .then(
      (res) => res.status,
      () => 500,
    );
type Case = {
  name: string;
  load: () => Promise<Record<string, unknown>>;
  method: "GET" | "POST" | "DELETE";
  /** One permission, or any of several. */
  needs: string | string[];
};

const cases: Case[] = [
  {
    name: "GET /therapists",
    load: () => import("./therapists/route"),
    method: "GET",
    needs: "therapists.view",
  },
  {
    name: "POST /therapists",
    load: () => import("./therapists/route"),
    method: "POST",
    needs: "therapists.add",
  },
  {
    name: "GET /therapists/[id]",
    load: () => import("./therapists/[id]/route"),
    method: "GET",
    needs: "therapists.view",
  },
  {
    name: "POST /therapists/[id]/active",
    load: () => import("./therapists/[id]/active/route"),
    method: "POST",
    needs: "therapists.deactivate",
  },
  {
    name: "POST /therapists/[id]/reset-password",
    load: () => import("./therapists/[id]/reset-password/route"),
    method: "POST",
    needs: "therapists.reset-password",
  },
  {
    name: "GET /therapists/export",
    load: () => import("./therapists/export/route"),
    method: "GET",
    needs: "therapists.export",
  },
  {
    name: "GET /therapists/[id]/staff",
    load: () => import("./therapists/[id]/staff/route"),
    method: "GET",
    needs: "therapists.view",
  },
  {
    name: "POST /therapists/[id]/staff",
    load: () => import("./therapists/[id]/staff/route"),
    method: "POST",
    needs: "therapists.view",
  },
  {
    name: "POST /schedule",
    load: () => import("./schedule/route"),
    method: "POST",
    needs: "schedule.manage",
  },
  {
    name: "POST /schedule/[id]",
    load: () => import("./schedule/[id]/route"),
    method: "POST",
    needs: "schedule.manage",
  },
  {
    name: "POST /schedule/preview",
    load: () => import("./schedule/preview/route"),
    method: "POST",
    needs: ["schedule.manage", "schedule.assign"],
  },
  {
    name: "GET /schedule/resources",
    load: () => import("./schedule/resources/route"),
    method: "GET",
    needs: "schedule.manage",
  },
  {
    name: "POST /schedule/resources",
    load: () => import("./schedule/resources/route"),
    method: "POST",
    needs: "schedule.manage",
  },
  {
    name: "GET /schedule/quick",
    load: () => import("./schedule/quick/route"),
    method: "GET",
    needs: "schedule.manage",
  },
  {
    name: "POST /schedule/quick",
    load: () => import("./schedule/quick/route"),
    method: "POST",
    needs: "schedule.manage",
  },
  {
    name: "GET /clients/[id]/matches",
    load: () => import("./clients/[id]/matches/route"),
    method: "GET",
    needs: "schedule.assign",
  },
  {
    name: "POST /clients/[id]/auto-allocate",
    load: () => import("./clients/[id]/auto-allocate/route"),
    method: "POST",
    needs: "schedule.assign",
  },
  {
    name: "POST /clients/[id]/requests",
    load: () => import("./clients/[id]/requests/route"),
    method: "POST",
    needs: "schedule.assign",
  },
  {
    name: "DELETE /requests/[id]",
    load: () => import("./requests/[id]/route"),
    method: "DELETE",
    needs: "schedule.assign",
  },
  {
    name: "GET /operations/matches",
    load: () => import("./operations/matches/route"),
    method: "GET",
    needs: "operations.matching",
  },
  {
    name: "POST /operations/runs/[id]",
    load: () => import("./operations/runs/[id]/route"),
    method: "POST",
    needs: "operations.retry-runs",
  },
  {
    name: "GET /patient-requests",
    load: () => import("./patient-requests/route"),
    method: "GET",
    needs: "patient-requests.process",
  },
  {
    name: "POST /patient-requests",
    load: () => import("./patient-requests/route"),
    method: "POST",
    needs: "patient-requests.process",
  },
  {
    name: "POST /clients/[id]/invite",
    load: () => import("./clients/[id]/invite/route"),
    method: "POST",
    needs: "patient-requests.process",
  },
];

const holds = (roleSlug: string, needs: string | string[]) =>
  [needs].flat().some((p) => defaultPermissionsFor(roleSlug as never).includes(p));

describe.each(cases)("$name", ({ load, method, needs }) => {
  it.each(builtInRoles)(
    "$name: 403 only when the role lacks the permission",
    async ({ slug, name }) => {
      as(name);
      const handler = (await load())[method] as Handler;
      const status = await run(handler, method);
      expect(status === 403, `${name} -> ${status}`).toBe(!holds(slug, needs));
    },
  );

  it("always lets the Super Admin through", async () => {
    as("Super Admin");
    const handler = (await load())[method] as Handler;
    expect(await run(handler, method)).not.toBe(403);
  });
});

describe("a custom permission set", () => {
  it("lets a role with only schedule.assign preview a booking but not manage the schedule", async () => {
    actor = grantPermissions(
      { _id: new ObjectId(), role: "admin", staffRoles: ["Booker"] } as unknown as UserDoc,
      ["schedule.assign"],
    );
    const preview = (await import("./schedule/preview/route")).POST as Handler;
    const manage = (await import("./schedule/[id]/route")).POST as Handler;
    expect((await preview(json("POST"), ctx)).status).not.toBe(403);
    expect((await manage(json("POST"), ctx)).status).toBe(403);
  });
});
