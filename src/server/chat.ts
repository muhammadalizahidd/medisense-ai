import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { ConversationDto, MessageDto } from "@/lib/live/types";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { publish } from "./live";
import type { ConversationDoc, MessageDoc, UserDoc } from "./models";

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(2000, "Keep messages under 2,000 characters"),
});

const isMember = (c: ConversationDoc, userId: ObjectId) =>
  c.memberIds.some((m) => m.equals(userId));

async function myConversation(user: UserDoc, id: ObjectId) {
  const { conversations } = await collections();
  const conversation = await conversations.findOne({ _id: id });
  if (!conversation || !isMember(conversation, user._id)) {
    throw new UserFacingError("Conversation not found.", 404);
  }
  return conversation;
}

function toDto(m: MessageDoc, names: Map<string, string>, others: ObjectId[]): MessageDto {
  return {
    id: m._id.toHexString(),
    conversationId: m.conversationId.toHexString(),
    senderId: m.senderId.toHexString(),
    senderName: names.get(m.senderId.toHexString()) ?? "",
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    seen: others.some((o) => m.readBy.some((r) => r.equals(o))),
    attachment: m.attachment ?? null,
  };
}

export async function listConversations(user: UserDoc): Promise<ConversationDto[]> {
  const db = await collections();
  const rows = await db.conversations
    .find({ memberIds: user._id })
    .sort({ "lastMessage.at": -1, createdAt: -1 })
    .toArray();
  const [clients, therapists, unread] = await Promise.all([
    db.clients.find({ _id: { $in: rows.map((r) => r.clientId) } }).toArray(),
    db.therapists.find({ _id: { $in: rows.map((r) => r.therapistId) } }).toArray(),
    db.messages
      .aggregate<{ _id: ObjectId; count: number }>([
        {
          $match: {
            conversationId: { $in: rows.map((r) => r._id) },
            senderId: { $ne: user._id },
            readBy: { $ne: user._id },
          },
        },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const therapistById = new Map(therapists.map((t) => [t._id.toHexString(), t]));
  const unreadBy = new Map(unread.map((u) => [u._id.toHexString(), u.count]));
  return rows.map((r) => {
    const therapist = therapistById.get(r.therapistId.toHexString());
    const client = clientById.get(r.clientId.toHexString());
    const iAmTherapist = user.role === "therapist";
    return {
      id: r._id.toHexString(),
      clientId: r.clientId.toHexString(),
      title: (iAmTherapist ? client?.name : therapist?.name) ?? "Conversation",
      subtitle: iAmTherapist ? (client?.suburb ?? "") : (therapist?.discipline ?? ""),
      lastMessage: r.lastMessage?.body ?? null,
      lastAt: r.lastMessage?.at.toISOString() ?? null,
      unread: unreadBy.get(r._id.toHexString()) ?? 0,
    };
  });
}

async function memberNames(conversation: ConversationDoc) {
  const { users } = await collections();
  const members = await users
    .find({ _id: { $in: conversation.memberIds } }, { projection: { name: 1 } })
    .toArray();
  return new Map(members.map((m) => [m._id.toHexString(), m.name]));
}

export async function listMessages(user: UserDoc, id: ObjectId, before?: Date) {
  const { messages } = await collections();
  const conversation = await myConversation(user, id);
  const rows = await messages
    .find({ conversationId: id, ...(before ? { createdAt: { $lt: before } } : {}) })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const names = await memberNames(conversation);
  const others = conversation.memberIds.filter((m) => !m.equals(user._id));
  return rows.reverse().map((m) => toDto(m, names, others));
}

export async function sendMessage(user: UserDoc, id: ObjectId, body: string) {
  const { messages, conversations } = await collections();
  const conversation = await myConversation(user, id);
  const doc: MessageDoc = {
    _id: new ObjectId(),
    conversationId: id,
    senderId: user._id,
    body,
    createdAt: new Date(),
    readBy: [user._id],
  };
  await messages.insertOne(doc);
  // The message reaches the other person first; the conversation preview updates alongside.
  const others = conversation.memberIds.filter((m) => !m.equals(user._id));
  const message = toDto(doc, new Map([[user._id.toHexString(), user.name]]), others);
  await Promise.all([
    publish(conversation.memberIds, "message", { message }),
    conversations.updateOne(
      { _id: id },
      {
        $set: { lastMessage: { body: body.slice(0, 140), senderId: user._id, at: doc.createdAt } },
      },
    ),
  ]);
  return message;
}

export async function markRead(user: UserDoc, id: ObjectId) {
  const { messages } = await collections();
  const conversation = await myConversation(user, id);
  const result = await messages.updateMany(
    { conversationId: id, readBy: { $ne: user._id } },
    { $addToSet: { readBy: user._id } },
  );
  if (result.modifiedCount > 0) {
    await publish(conversation.memberIds, "read", {
      conversationId: id.toHexString(),
      readerId: user._id.toHexString(),
    });
  }
}

/** Tells the other person someone is typing. Nothing is stored except the short-lived event. */
export async function signalTyping(user: UserDoc, id: ObjectId) {
  const conversation = await myConversation(user, id);
  const others = conversation.memberIds.filter((m) => !m.equals(user._id));
  await publish(others, "typing", {
    conversationId: id.toHexString(),
    name: user.name.split(" ")[0] ?? user.name,
  });
}

/** Messages matching the words, across this person's own conversations only. */
export async function searchMessages(user: UserDoc, query: string) {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const { conversations, messages } = await collections();
  const mine = await conversations
    .find({ memberIds: user._id }, { projection: { _id: 1 } })
    .toArray();
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await messages
    .find({ conversationId: { $in: mine.map((c) => c._id) }, body: pattern })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return rows.map((m) => ({
    id: m._id.toHexString(),
    conversationId: m.conversationId.toHexString(),
    mine: m.senderId.equals(user._id),
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));
}
