import { z } from "zod";
import { currentUser, requireUser } from "@/server/auth";
import { DatabaseUnavailable } from "@/server/db";
import type { AiFeaturesDto } from "@/lib/ai/features";
import { handle, readJson } from "@/server/http";
import { aiFeatures, setAiEnabled } from "@/server/settings";

const schema = z.object({ enabled: z.boolean() });

const OFFLINE: AiFeaturesDto = {
  enabled: true,
  persisted: false,
  canChange: true,
  signedIn: false,
  updatedBy: null,
  updatedAt: null,
};

/** Open to anyone, signed in or not, so every screen knows which features to offer. */
export async function GET() {
  return handle(async () => {
    try {
      return await aiFeatures(await currentUser());
    } catch (error) {
      if (error instanceof DatabaseUnavailable) return OFFLINE;
      throw error;
    }
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const { enabled } = await readJson(request, schema);
    return setAiEnabled(admin, enabled);
  });
}
