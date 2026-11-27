import { z } from "zod";
import { allowAttempt, hashPassword, inviteMatches, requireUser } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { audit } from "@/server/live";

/** What a patient signs in with besides their MRN. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("client");
    return { email: user.email, hasPassword: Boolean(user.passwordHash) };
  });
}

const schema = z.object({
  email: z.email("Check the email address").trim().toLowerCase().max(200),
  password: z.string().min(10, "Use at least 10 characters for the password").max(200),
  /** Asked again so that someone else holding an unlocked phone can't take over the account. */
  mrn: z.string().trim().min(6, "Enter your MRN to confirm it's you").max(24),
});

/**
 * A patient adds an email and password to their account, or changes them. Their MRN keeps working
 * too, so they can sign in either way; it also confirms it's them, and resets a forgotten password.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("client");
    const { email, password, mrn } = await readJson(request, schema);
    if (!allowAttempt(`patient-sign-in:${user._id.toHexString()}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    if (!inviteMatches(user, mrn)) {
      throw new UserFacingError(
        "That MRN doesn't match your record. Check it, or ask your care team.",
      );
    }
    const { users } = await collections();
    if (await users.findOne({ email, _id: { $ne: user._id } }, { projection: { _id: 1 } })) {
      throw new UserFacingError(
        "That email is already used by another account. Use a different email.",
        409,
      );
    }
    const first = !user.passwordHash;
    await users.updateOne(
      { _id: user._id },
      { $set: { email, passwordHash: await hashPassword(password), mustChangePassword: false } },
    );
    await audit(
      user,
      first ? "Set an email and password for the patient app" : "Changed their sign-in details",
      user.clientId,
    );
    return { email, hasPassword: true };
  });
}
