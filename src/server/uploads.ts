import "server-only";
import type { DocumentKind } from "@/lib/live/catalogue";
import { UserFacingError } from "./http";
import { MAX_FILES, type IncomingFile } from "./referrals";

/** Reads a multipart request: a JSON field, a text field, and files with a kind for each. */
export async function readMultipart(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new UserFacingError("The form couldn't be read. Try again.");
  }
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length > MAX_FILES) throw new UserFacingError(`Attach up to ${MAX_FILES} files.`);
  const kinds = form.getAll("kinds").map(String);
  const files: IncomingFile[] = await Promise.all(
    uploads.map(async (f, i) => ({
      kind: (kinds[i] ?? "Other") as DocumentKind,
      name: f.name || "document",
      type: f.type,
      bytes: Buffer.from(await f.arrayBuffer()),
    })),
  );
  const json = form.get("referral");
  let referral: unknown = null;
  if (typeof json === "string") {
    try {
      referral = JSON.parse(json);
    } catch {
      throw new UserFacingError("The form couldn't be read. Try again.");
    }
  }
  const answer = form.get("answer");
  const photo = form.get("photo");
  return {
    referral,
    files,
    answer: typeof answer === "string" ? answer : "",
    photo: typeof photo === "string" && photo ? photo : null,
  };
}

/** The caller's address, for the per-address limit on public submissions. */
export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
