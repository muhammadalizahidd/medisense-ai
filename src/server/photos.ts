import "server-only";
import { Binary, type ObjectId } from "mongodb";
import { z } from "zod";
import { adminIds, audit, publish } from "./live";
import { collections } from "./db";
import { UserFacingError } from "./http";
import type { UserDoc } from "./models";

/**
 * Profile photos uploaded for therapists and patients. The browser crops and shrinks each one to a
 * small square before sending it, so they're stored in the database next to the record they
 * belong to, keyed by its id. A referral's photo moves to the patient when the referral is accepted.
 */
export type PhotoOwner = "therapist" | "client" | "referral";

interface PhotoDoc {
  _id: string;
  type: string;
  data: Binary;
  updatedAt: Date;
}

const MAX_BYTES = 400_000;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export const photoSchema = z.object({
  photo: z.string().max(600_000, "The photo is too large.").nullable(),
});

const key = (owner: PhotoOwner, id: ObjectId) => `${owner}:${id.toHexString()}`;

async function store() {
  const { db } = await collections();
  return db.collection<PhotoDoc>("photos");
}

/** Checks the file really is the image it claims to be, not just its label. */
function decode(dataUrl: string) {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new UserFacingError("Choose a JPEG, PNG or WebP photo.");
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > MAX_BYTES) throw new UserFacingError("The photo is too large.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes.subarray(1, 4).toString("ascii") === "PNG";
  const webp = bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!jpeg && !png && !webp) throw new UserFacingError("That file isn't a photo.");
  return { type: match[1]!, bytes };
}

/** The URL a page shows; the version makes browsers fetch a replaced photo straight away. */
export function photoUrl(owner: "therapist" | "client", id: ObjectId, at?: Date | null) {
  return at ? `/api/photos/${owner}/${id.toHexString()}?v=${at.getTime()}` : null;
}

async function stamp(owner: PhotoOwner, id: ObjectId, at: Date | null) {
  const { therapists, clients } = await collections();
  if (owner === "therapist") await therapists.updateOne({ _id: id }, { $set: { photoAt: at } });
  if (owner === "client") await clients.updateOne({ _id: id }, { $set: { photoAt: at } });
}

/** Saves (or with null, removes) a photo without checking who asked; callers check access. */
export async function putPhoto(owner: PhotoOwner, id: ObjectId, dataUrl: string | null) {
  const photos = await store();
  if (!dataUrl) {
    await photos.deleteOne({ _id: key(owner, id) });
    await stamp(owner, id, null);
    return null;
  }
  const { type, bytes } = decode(dataUrl);
  const at = new Date();
  await photos.updateOne(
    { _id: key(owner, id) },
    { $set: { type, data: new Binary(bytes), updatedAt: at } },
    { upsert: true },
  );
  await stamp(owner, id, at);
  return at;
}

/** Who may change a photo: staff for anyone, a therapist for their own. */
function mayEdit(user: UserDoc, owner: "therapist" | "client", id: ObjectId) {
  if (user.role === "admin") return true;
  return (
    owner === "therapist" && user.role === "therapist" && Boolean(user.therapistId?.equals(id))
  );
}

/** Who may see a photo: staff and therapists see everyone, a patient sees their own and staff. */
function mayView(user: UserDoc, owner: "therapist" | "client", id: ObjectId) {
  if (user.role !== "client") return true;
  return owner === "therapist" || Boolean(user.clientId?.equals(id));
}

async function exists(owner: "therapist" | "client", id: ObjectId) {
  const { therapists, clients } = await collections();
  const found =
    owner === "therapist"
      ? await therapists.findOne({ _id: id }, { projection: { name: 1 } })
      : await clients.findOne({ _id: id }, { projection: { name: 1 } });
  if (!found) throw new UserFacingError("Not found.", 404);
  return found.name;
}

export async function changePhoto(
  user: UserDoc,
  owner: "therapist" | "client",
  id: ObjectId,
  dataUrl: string | null,
) {
  if (!mayEdit(user, owner, id)) throw new UserFacingError("You can't change this photo.", 404);
  const name = await exists(owner, id);
  const at = await putPhoto(owner, id, dataUrl);
  await audit(user, `${at ? "Updated" : "Removed"} the profile photo for ${name}`, null);
  await publish(
    [...(await adminIds()), user._id],
    "care",
    owner === "client" ? { clientId: id.toHexString() } : {},
  );
  return { photoUrl: photoUrl(owner, id, at) };
}

export async function readPhoto(user: UserDoc, owner: "therapist" | "client", id: ObjectId) {
  if (!mayView(user, owner, id)) return null;
  const found = await (await store()).findOne({ _id: key(owner, id) });
  return found ? { type: found.type, bytes: Buffer.from(found.data.buffer) } : null;
}

/** Module 01: the photo entered with a referral follows the participant onto their record. */
export async function carryReferralPhoto(referralId: ObjectId, clientId: ObjectId) {
  const photos = await store();
  const found = await photos.findOne({ _id: key("referral", referralId) });
  if (!found) return;
  const at = new Date();
  await photos.updateOne(
    { _id: key("client", clientId) },
    { $set: { type: found.type, data: found.data, updatedAt: at } },
    { upsert: true },
  );
  await photos.deleteOne({ _id: found._id });
  await stamp("client", clientId, at);
}
