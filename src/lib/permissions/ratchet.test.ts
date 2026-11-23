import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Role names are being moved out of the code and into the permission catalogue, one module at a
 * time. This counts the lines that still name a role, per file. It may only go down: a new check
 * must use a permission (lib/permissions), not a role name. Lower a count here when a module moves.
 * The two counts raised for the Super Admin transfer are display and ownership code, not checks.
 */
const BASELINE: Record<string, number> = {
  "features/erp/erp.tsx": 1,
  "features/live/admin-app.tsx": 2,
  "features/live/assess-queue.tsx": 1,
  "features/live/coord-task.tsx": 1,
  "features/live/finance-hub.tsx": 2,
  "features/live/ops-hub.tsx": 3,
  "features/live/plan-list.tsx": 1,
  "features/live/record-page.tsx": 1,
  "features/live/reports-admin.tsx": 1,
  "features/live/reports-hub.tsx": 2,
  "features/live/user-control.tsx": 15,
  "lib/live/catalogue.ts": 8,
  "lib/live/funding.ts": 5,
  "lib/live/operations.ts": 6,
  "lib/live/report-catalogue.ts": 7,
  "lib/live/report-dto.ts": 4,
  "lib/live/reports.ts": 19,
  "lib/live/routes.ts": 1,
  "lib/navigation.ts": 1,
  "server/agent.ts": 18,
  "server/assess.ts": 2,
  "server/assistant-live.ts": 1,
  "server/clinical.ts": 1,
  "server/coord.ts": 1,
  "server/finance.ts": 2,
  "server/funding.ts": 10,
  "server/operations-catalogue.ts": 10,
  "server/operations-engine.ts": 12,
  "server/operations-volume.ts": 9,
  "server/operations.ts": 21,
  "server/portal.ts": 1,
  "server/progress.ts": 3,
  "server/records.ts": 3,
  "server/referrals.ts": 1,
  "server/report-actions.ts": 7,
  "server/report-insights.ts": 8,
  "server/reports-demo.ts": 6,
  "server/reports.ts": 4,
  "server/seed.ts": 6,
  "server/sessions.ts": 3,
  "server/telehealth.ts": 1,
  "server/tplan.ts": 1,
  "server/user-control.ts": 1,
  "server/workspace.ts": 2,
};

const ROLE_NAME =
  /"(Super Admin|Intake Officer|Scheduler|Finance Manager|Finance|Operations Manager|Clinical Lead)"/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function counts() {
  const result: Record<string, number> = {};
  for (const file of sourceFiles("src")) {
    const rel = file
      .split("\\")
      .join("/")
      .replace(/^src\//, "");
    if (
      rel.includes("design-preview/") ||
      rel.startsWith("lib/permissions/") ||
      rel.startsWith("test/")
    )
      continue;
    if (rel.endsWith(".test.ts") || rel === "server/roles-seed.ts") continue;
    const n = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => ROLE_NAME.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)).length;
    if (n > 0) result[rel] = n;
  }
  return result;
}

describe("role names in code", () => {
  const found = counts();

  it("are not used in any file that did not use them before", () => {
    const added = Object.keys(found).filter((f) => !(f in BASELINE));
    expect(added, "Use a permission from lib/permissions instead of a role name.").toEqual([]);
  });

  it("do not appear on more lines than before", () => {
    const grown = Object.entries(found).filter(([f, n]) => n > (BASELINE[f] ?? 0));
    expect(grown, "Use a permission from lib/permissions instead of a role name.").toEqual([]);
  });
});
