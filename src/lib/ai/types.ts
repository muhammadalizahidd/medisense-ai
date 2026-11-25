/** An error whose message is safe to show in the UI. */
export class AiError extends Error {}

/** What people see when something is switched off. It deliberately doesn't name the feature. */
export const TURNED_OFF = "Turned off by your organisation";

/** The organisation switch is off. Never treat this as a failed call that needs a prepared draft. */
export class AiDisabled extends AiError {
  constructor() {
    super(TURNED_OFF);
  }
}

/** For catch blocks that reword failures: the switch being off passes through untouched. */
export function rethrowDisabled(error: unknown) {
  if (error instanceof AiDisabled) throw error;
}

export type JsonSchema = Record<string, unknown>;

/** A read-only tool the model may call. `run` returns plain JSON-serialisable data. */
export type AiTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (input: Record<string, unknown>) => unknown;
};

export type JsonRequest = {
  system: string;
  user: string;
  /** JSON schema the final answer must match: every object sets `additionalProperties: false`. */
  schema: JsonSchema;
  schemaName: string;
  maxTokens?: number;
};

export type ToolRequest = JsonRequest & { tools: AiTool[]; maxSteps?: number };

/** Raw model output: the final JSON text plus which model answered and which tools ran. */
export type AiOutput = { text: string; model: string; toolCalls: string[] };

export type KeyCheck =
  { ok: true } | { ok: false; kind: "invalid" | "unreachable"; reason: string };

/** Runs one tool call safely, so a failing tool becomes an error message the model can read. */
export function runTool(tools: AiTool[], name: string, input: unknown) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  try {
    const args =
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    return tool.run(args);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Tool failed" };
  }
}
