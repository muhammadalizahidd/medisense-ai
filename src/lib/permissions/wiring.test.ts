import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enforcedPermissions, permissionIds } from "./catalogue";

/*
 * The permissions the code checks must be real, and every permission the editor calls "enforced"
 * must be checked somewhere. This reads the source, so a typo in a permission id, or an
 * "enforced" claim with nothing behind it, fails here.
 */

const CHECK = /\b(can|mustCan|canAny|mustCanAny|hasPermission|has)\(/;
const ID = /"([a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)+)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

function checkedIds() {
  const found = new Map<string, string[]>();
  for (const root of ["src/server", "src/app/api", "src/lib/live"]) {
    for (const file of sourceFiles(root)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        // The check and its permission id sit on the same line or the next (long calls wrap).
        const window = `${line} ${lines[i + 1] ?? ""}`;
        if (!CHECK.test(line)) return;
        for (const match of window.matchAll(ID)) {
          const id = match[1]!;
          found.set(id, [...(found.get(id) ?? []), `${file}:${i + 1}`]);
        }
      });
    }
  }
  // Report domain permissions are built from the domain list rather than written out, so they
  // count as checked when the scope builder reads both kinds for every domain.
  const scope = readFileSync("src/lib/live/reports.ts", "utf8");
  if (scope.includes("reportReadId(d)") && scope.includes("reportDetailId(d)")) {
    for (const id of permissionIds.filter(
      (p) => p.startsWith("reports.read.") || p.startsWith("reports.detail."),
    )) {
      found.set(id, ["src/lib/live/reports.ts"]);
    }
  }
  return found;
}

describe("permission checks in the code", () => {
  const found = checkedIds();

  it("only name permissions that exist in the catalogue", () => {
    // Role-like dotted strings (file names, module paths) are filtered by the catalogue itself:
    // anything that looks like an id but isn't one is reported.
    const unknown = [...found.keys()].filter((id) => !permissionIds.includes(id));
    expect(unknown).toEqual([]);
  });

  it("back every permission the editor calls enforced", () => {
    const missing = enforcedPermissions.filter((id) => !found.has(id));
    expect(missing).toEqual([]);
  });

  it("enforce every permission in the catalogue", () => {
    // New permissions are only added together with the check that enforces them.
    expect(permissionIds.filter((id) => !enforcedPermissions.includes(id))).toEqual([]);
  });

  it("list only permissions that exist as enforced", () => {
    const unknown = enforcedPermissions.filter((id) => !permissionIds.includes(id));
    expect(unknown).toEqual([]);
  });
});
