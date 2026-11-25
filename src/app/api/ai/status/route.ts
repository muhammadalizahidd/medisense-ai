import { checkAiKey } from "@/lib/ai/engine";
import { aiSwitchOn } from "@/server/ai-switch";

/** `GET /api/ai/status` reports whether live AI is available; `?recheck=1` checks the key again. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!(await aiSwitchOn())) return Response.json({ state: "disabled" }, { headers });
  const recheck = new URL(request.url).searchParams.has("recheck");
  const status = await checkAiKey(recheck);
  return Response.json(status, { headers });
}
