import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { previewSchema, seriesPreview } from "@/server/scheduling";

/** The occurrences a series would book, with collisions, without booking anything. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser("admin");
    return { occurrences: await seriesPreview(await readJson(request, previewSchema)) };
  });
}
