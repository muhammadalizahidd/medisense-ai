import { describe, expect, it } from "vitest";
import { AI_SWITCH_ROUTE, aiRouteRedirect, isAiOnlyRoute } from "./routes";

describe("screens while the switch is off", () => {
  it("keeps the switch's screen only for whoever can change it", () => {
    expect(aiRouteRedirect(AI_SWITCH_ROUTE, true)).toBeNull();
    expect(aiRouteRedirect(AI_SWITCH_ROUTE)).toBe("/care/operations");
  });

  it("closes the other screens for everyone", () => {
    for (const path of ["/care/ai-agent", "/therapist/ai", "/assistant"]) {
      expect(isAiOnlyRoute(path, true)).toBe(true);
    }
    expect(isAiOnlyRoute("/care/operations")).toBe(false);
  });
});
