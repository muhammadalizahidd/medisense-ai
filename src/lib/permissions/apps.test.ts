import { describe, expect, it } from "vitest";
import { accessFor, type Session } from "@/lib/access";
import {
  ALL_APPS,
  NO_APPS,
  appForPath,
  appOpen,
  appsFor,
  appsForRole,
  landingPath,
  limitToApps,
} from "./apps";

const staff = (...ids: string[]) => appsFor(new Set(ids), ["Scheduler"]);
const session = (apps = NO_APPS, role: Session["role"] = "admin") => ({
  role,
  apps,
  home: landingPath(role, [], apps),
});

describe("which apps a person has", () => {
  it("follows the switches on their roles", () => {
    expect(staff("app.admin", "finance.work", "app.mobile.staff")).toEqual({
      ...NO_APPS,
      admin: true,
      mobile: { ...NO_APPS.mobile, staff: true },
    });
  });

  it("gives the Super Admin every app, whatever is stored", () => {
    expect(appsFor(new Set(), ["Super Admin"])).toEqual(ALL_APPS);
  });

  it("gives a new role no apps", () => {
    expect(staff()).toEqual(NO_APPS);
  });

  it("gives no admin app to someone whose roles grant no permission, even with the switch on", () => {
    expect(staff("app.admin").admin).toBe(false);
    expect(staff("app.admin", "app.therapist").admin).toBe(false);
    expect(staff("app.admin", "finance.work").admin).toBe(true);
  });

  it("keeps therapists to the therapist app and patients to the patient app", () => {
    expect(appsForRole("therapist", ["app.admin"], [])).toEqual({ ...NO_APPS, therapist: true });
    expect(appsForRole("client", ["app.admin"], [])).toEqual({
      ...NO_APPS,
      mobile: { ...NO_APPS.mobile, patient: true },
    });
  });
});

describe("which app a page belongs to", () => {
  it("names the app for each route", () => {
    expect(appForPath("/care/billing")).toBe("admin");
    expect(appForPath("/")).toBe("admin");
    expect(appForPath("/therapist/patients/x")).toBe("therapist");
    expect(appForPath("/telehealth/room/abc")).toBe("therapist");
    expect(appForPath("/mobile/family")).toBe("mobile.family");
    expect(appForPath("/mobile/patient")).toBe("mobile.patient");
    expect(appForPath("/mobile/staff?tab=x")).toBe("mobile.staff");
    expect(appForPath("/mobile/therapist")).toBe("mobile.therapist");
  });

  it("leaves the profile and public pages open to everyone", () => {
    for (const path of ["/profile", "/profile#appearance", "/login", "/refer", "/join/abc"]) {
      expect(appForPath(path)).toBeNull();
      expect(appOpen(path, NO_APPS)).toBe(true);
    }
  });
});

describe("closing an app that is off", () => {
  it("closes every route of the app, by link too", () => {
    const apps = staff("app.admin", "finance.work");
    expect(appOpen("/care/referrals/123", apps)).toBe(true);
    expect(appOpen("/therapist", apps)).toBe(false);
    expect(appOpen("/mobile/staff", apps)).toBe(false);
    expect(appOpen("/care/referrals/123", staff("app.therapist"))).toBe(false);
  });

  it("sends a person with an app off to the first app they have, else their profile", () => {
    expect(landingPath("admin", [], staff("app.therapist"))).toBe("/therapist");
    expect(landingPath("admin", [], staff("app.mobile.staff"))).toBe("/mobile/staff");
    expect(landingPath("admin", [], NO_APPS)).toBe("/profile");
    expect(landingPath("admin", ["Super Admin"], ALL_APPS)).toBe("/");
    expect(landingPath("admin", [], staff("app.admin", "finance.work"))).toBe("/care");
  });

  it("blocks the proxy's page request and sends them to their landing page", () => {
    const apps = staff("app.therapist");
    expect(accessFor("/care/billing", session(apps))).toEqual({
      allow: false,
      redirect: "/therapist",
    });
    expect(accessFor("/therapist", session(apps))).toEqual({ allow: true });
    expect(accessFor("/profile", session(NO_APPS))).toEqual({ allow: true });
    expect(accessFor("/care", session(NO_APPS))).toEqual({ allow: false, redirect: "/profile" });
  });

  it("leaves a therapist's role-based pages open", () => {
    const apps = appsForRole("therapist", [], []);
    expect(accessFor("/my-day", session(apps, "therapist"))).toEqual({ allow: true });
    expect(accessFor("/mobile/staff", session(apps, "therapist"))).toEqual({
      allow: false,
      redirect: "/therapist/today",
    });
  });

  it("takes every permission away from an admin whose admin app is off, so the API refuses too", () => {
    const held = new Set(["finance.work", "app.therapist", "roles.manage"]);
    expect([...limitToApps(held, ["Finance"])]).toEqual(["app.therapist"]);
    expect([...limitToApps(new Set(["finance.work", "app.admin"]), ["Finance"])]).toEqual([
      "finance.work",
      "app.admin",
    ]);
    expect(limitToApps(new Set(["finance.work"]), ["Super Admin"]).size).toBe(1);
  });
});
