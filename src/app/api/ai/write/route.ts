import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { requireUser } from "@/server/auth";
import { handle, readJson, UserFacingError } from "@/server/http";

const schema = z.object({
  field: z.string().trim().max(120),
  text: z.string().trim().min(3, "Write or dictate a few words first").max(6000),
});

/**
 * "Write with AI" for any note field: turns rough words or dictation into clear, professional
 * text. It only rewrites what the person wrote; it never adds facts, diagnoses or doses.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser();
    const { field, text } = await readJson(request, schema);
    try {
      const out = await generateJson("note-assist", {
        system:
          "You tidy a clinician's or staff member's rough notes for an Australian allied health practice. Rewrite the text clearly and professionally in Australian English, in the same voice, keeping every fact, number and name exactly. Refer to the person as the participant or patient, never the client. Do not add facts, diagnoses, risks, doses or recommendations that are not in the text. Keep it about the same length or shorter. Return plain text, no headings or markdown.",
        user: `Field: ${field || "Note"}\nRough text:\n${text}`,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: { text: { type: "string" } },
        } as never,
        schemaName: "note_text",
        maxTokens: 700,
      });
      const tidy = (JSON.parse(out.text) as { text: string }).text.trim();
      if (!tidy) throw new Error("empty");
      return { text: tidy };
    } catch {
      throw new UserFacingError(
        "AI writing isn't available right now. Your text is unchanged.",
        409,
      );
    }
  });
}
