import { describe, expect, it } from "vitest";
import { isActive } from "./navigation";

const lit = (path: string, hrefs: string[]) => hrefs.filter((h) => isActive(path, h));
const live = ["/care", "/care/therapists", "/profile"];

describe("sidebar highlighting", () => {
  it("lights exactly one entry on onboarding pages", () => {
    expect(lit("/care", live)).toEqual(["/care"]);
    expect(lit("/care/new", live)).toEqual(["/care"]);
    expect(lit("/care/abc123", live)).toEqual(["/care"]);
  });

  it("lights only Therapists on therapist pages", () => {
    expect(lit("/care/therapists", live)).toEqual(["/care/therapists"]);
    expect(lit("/care/therapists/abc123", live)).toEqual(["/care/therapists"]);
  });

  it("keeps single-record entries lit across their section", () => {
    expect(isActive("/sessions/oliver-grant/prepared", "/sessions/oliver-grant")).toBe(true);
    expect(isActive("/patients/emily-carter", "/patients")).toBe(true);
  });
});
