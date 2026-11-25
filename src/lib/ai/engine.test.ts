import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let on = true;

vi.mock("@/server/ai-switch", () => ({ aiSwitchOn: async () => on }));
vi.mock("./providers", () => ({
  providers: {},
  maskKey: () => "k",
  requestedProvider: () => null,
  activeProvider: () => ({ id: "test", label: "Test", model: "m", key: "k", keyEnv: "K" }),
}));
vi.mock("./openai-compatible", () => ({
  checkCompatible: async () => ({ ok: true }),
  compatibleJson: async () => {
    calls.push("json");
    return { text: "{}", model: "m", toolCalls: [] };
  },
  compatibleTools: async () => {
    calls.push("tools");
    return { text: "{}", model: "m", toolCalls: [] };
  },
}));

const { generateJson, generateWithTools } = await import("./engine");
const { AiDisabled, AiError, rethrowDisabled } = await import("./types");

const request = { system: "s", user: "u", schema: {}, schemaName: "n" };

describe("organisation AI switch", () => {
  it("calls the model while on", async () => {
    on = true;
    await generateJson("t", request);
    expect(calls).toEqual(["json"]);
  });

  it("refuses every kind of model call while off", async () => {
    on = false;
    calls.length = 0;
    await expect(generateJson("t", request)).rejects.toBeInstanceOf(AiDisabled);
    await expect(generateWithTools("t", { ...request, tools: [] })).rejects.toBeInstanceOf(
      AiDisabled,
    );
    expect(calls).toEqual([]);
  });

  it("never names the feature in what people see, and passes through rewording catches", () => {
    const error = new AiDisabled();
    expect(error).toBeInstanceOf(AiError);
    expect(error.message).not.toMatch(/\bAI\b/);
    expect(() => rethrowDisabled(error)).toThrow(error);
    expect(() => rethrowDisabled(new AiError("rate limited"))).not.toThrow();
  });
});
