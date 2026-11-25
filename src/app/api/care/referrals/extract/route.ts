import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { rethrowDisabled } from "@/lib/ai/types";
import {
  extractionSchema,
  referralFromExtraction,
  type ReferralExtraction,
} from "@/lib/live/referral-extract";
import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, readJson, UserFacingError } from "@/server/http";
import { audit } from "@/server/live";

const schema = z.object({
  source: z.string().trim().max(40),
  text: z.string().trim().min(40, "Paste the whole referral first").max(12000),
});

const SYSTEM = `You read referrals sent to Medisense, an allied health provider in Brisbane, Australia, and copy their details into a form.
Rules:
- Copy only what the text says. Never guess or invent a name, date, number, diagnosis or risk. Leave a field as "" when the text doesn't give it.
- Dates as YYYY-MM-DD (Australian dates are day/month/year).
- submitterRole is who sent it (a support coordinator, parent or guardian, the participant, an authorised representative, or "Other referrer").
- contact is the person to call to book visits and sign agreements (often a parent).
- supports: map the requested services to the allowed list; an assessment is frequency "Assessment".
- behaviours and knownRisk: "Yes" only if the text describes them, "No" only if it says there are none, otherwise "Unknown". Put the words used in the details.
- missing: short plain phrases for anything a referral normally needs that isn't in the text (for example "participant email", "plan type").
Use Australian English.`;

/**
 * Reads a referral pasted from an email, letter or call notes into the live referral form. It
 * only fills a draft: staff check every step, confirm consent and submit it themselves.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "referrals.process");
    const { source, text } = await readJson(request, schema);
    let extracted: ReferralExtraction;
    try {
      const out = await generateJson("referral-extract", {
        system: SYSTEM,
        user: `Received by: ${source || "Email"}\n\nReferral:\n${text}`,
        schema: extractionSchema as never,
        schemaName: "referral_extract",
        maxTokens: 1800,
      });
      extracted = JSON.parse(out.text) as ReferralExtraction;
    } catch (error) {
      rethrowDisabled(error);
      throw new UserFacingError(
        "AI couldn't read the referral just now. Your text is still here, so try again.",
        409,
      );
    }
    const { form, filled } = referralFromExtraction(extracted);
    if (filled < 3) {
      throw new UserFacingError(
        "That doesn't look like a referral. Paste the whole email or letter and try again.",
        400,
      );
    }
    await audit(
      admin,
      `AI read a referral received by ${source || "email"}; ${filled} fields drafted for staff to check`,
      null,
    );
    return { form, filled, missing: (extracted.missing ?? []).slice(0, 12), source };
  });
}
