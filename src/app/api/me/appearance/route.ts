import { z } from "zod";
import { ACCENTS, THEMES, TYPES } from "@/app/theme-script";
import { requireUser } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson } from "@/server/http";

const themeIds = Object.keys(THEMES) as [keyof typeof THEMES, ...(keyof typeof THEMES)[]];
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const schema = z.object({
  theme: z.enum([...themeIds, "system"]),
  lightTheme: z.enum(themeIds),
  darkTheme: z.enum(themeIds),
  accent: z.enum(ACCENTS),
  custom: z.record(z.string().regex(/^--color-[a-z-]+$/), colour).optional(),
  type: z.enum(TYPES),
  density: z.enum(["comfortable", "compact"]),
  text: z.enum(["default", "large", "larger"]),
});

/** Saves the signed-in person's appearance, so it follows them to other devices. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const appearance = await readJson(request, schema);
    const { users } = await collections();
    await users.updateOne({ _id: user._id }, { $set: { appearance } });
    return { ok: true };
  });
}
