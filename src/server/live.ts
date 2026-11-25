import "server-only";
import { ObjectId } from "mongodb";
import { clearCache } from "./cache";
import { collections } from "./db";
import type { LiveEventType, UserDoc } from "./models";

export async function publish(
  userIds: ObjectId[],
  type: LiveEventType,
  payload: Record<string, unknown> = {},
) {
  // Something changed: lists read from the cache are loaded fresh next time.
  clearCache();
  if (!userIds.length) return;
  const { events } = await collections();
  await events.insertOne({ _id: new ObjectId(), userIds, type, payload, createdAt: new Date() });
}

/** Stores a notification and pushes it to the person straight away. */
export async function notify(
  userIds: ObjectId[],
  note: { title: string; body: string; href: string },
) {
  if (!userIds.length) return;
  const { notifications } = await collections();
  const createdAt = new Date();
  await notifications.insertMany(
    userIds.map((userId) => ({ _id: new ObjectId(), userId, ...note, read: false, createdAt })),
  );
  await publish(userIds, "notification", { title: note.title });
}

export async function audit(actor: UserDoc, action: string, clientId: ObjectId | null) {
  const { audit } = await collections();
  await audit.insertOne({
    _id: new ObjectId(),
    actorId: actor._id,
    actorName: actor.name,
    action,
    clientId,
    at: new Date(),
  });
}

/** Everyone who can be signed in, for changes that affect the whole organisation. */
export async function allUserIds() {
  const { users } = await collections();
  const all = await users.find({ disabled: { $ne: true } }, { projection: { _id: 1 } }).toArray();
  return all.map((u) => u._id);
}

export async function adminIds() {
  const { users } = await collections();
  const admins = await users.find({ role: "admin" }, { projection: { _id: 1 } }).toArray();
  return admins.map((a) => a._id);
}
