import { describe, expect, it } from "vitest";
import { accessFor, type Session } from "./access";
import { ALL_APPS, appsForRole, landingPath } from "./permissions/apps";
import type { Role } from "./live/types";

/** An admin with every app, as the Super Admin has; other roles get the apps they are fixed to. */
const sessionFor = (role: Role | null): Session | null => {
  if (!role) return null;
  const apps = role === "admin" ? ALL_APPS : appsForRole(role, [], []);
  return { role, apps, home: landingPath(role, [], apps) };
};
const to = (path: string, role: Role | null) => {
  const a = accessFor(path, sessionFor(role));
  return a.allow ? "allow" : a.redirect;
};

describe("page access", () => {
  it("lets anyone open the public pages", () => {
    expect(to("/refer", null)).toBe("allow");
    expect(to("/join/abc", null)).toBe("allow");
    expect(to("/mobile/patient", null)).toBe("allow");
    expect(to("/login", "client")).toBe("allow");
  });

  it("sends signed-out visitors to sign in", () => {
    expect(to("/team-capacity", null)).toBe("/login?next=%2Fteam-capacity");
  });

  it("keeps patients in the patient app", () => {
    expect(to("/team-capacity", "client")).toBe("/mobile/patient");
    expect(to("/", "client")).toBe("/mobile/patient");
    expect(to("/care/referrals", "client")).toBe("/mobile/patient");
    expect(to("/therapist", "client")).toBe("/mobile/patient");
  });

  it("keeps therapists out of admin and leadership screens", () => {
    expect(to("/care/billing", "therapist")).toBe("/therapist");
    expect(to("/team-capacity", "therapist")).toBe("/therapist");
    expect(to("/admin-queue", "therapist")).toBe("/therapist");
    expect(to("/therapist/patients/x", "therapist")).toBe("allow");
    expect(to("/my-day", "therapist")).toBe("allow");
    expect(to("/patients/emily-carter", "therapist")).toBe("allow");
    expect(to("/telehealth/room/x", "therapist")).toBe("allow");
  });

  it("lets admins see staff screens but not a therapist's workspace", () => {
    expect(to("/team-capacity", "admin")).toBe("allow");
    expect(to("/care/billing", "admin")).toBe("allow");
    // An admin with every app (as the Super Admin has) may open the therapist app too.
    expect(to("/therapist", "admin")).toBe("allow");
  });
});
