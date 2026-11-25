import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { ChatPersonDto, ConversationDto, MessageDto } from "@/lib/live/types";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { publish } from "./live";
import type { MessageDoc, UserDoc } from "./models";

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(2000, "Keep messages under 2,000 characters"),
});

/** A care conversation (a patient and their therapist) or a direct chat an admin opened. */
type Thread = { _id: ObjectId; memberIds: ObjectId[]; direct: boolean };

const isMember = (memberIds: ObjectId[], userId: ObjectId) =>
  memberIds.some((m) => m.equals(userId));

async function myConversation(user: UserDoc, id: ObjectId): Promise<Thread> {
  const { conversations, directChats } = await collections();
  const care = await conversations.findOne({ _id: id });
  if (care && isMember(care.memberIds, user._id)) {
    return { _id: care._id, memberIds: care.memberIds, direct: false };
  }
  const direct = care ? null : await directChats.findOne({ _id: id });
  if (direct && isMember(direct.memberIds, user._id)) {
    return { _id: direct._id, memberIds: direct.memberIds, direct: true };
  }
  throw new UserFacingError("Conversation not found.", 404);
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

type About = Pick<ChatPersonDto, "group" | "role" | "photoKind">;

/** How each person is described in a chat: admin responsibilities, discipline or "Patient". */
async function describePeople(people: UserDoc[]) {
  const db = await collections();
  const [therapists, clients] = await Promise.all([
    db.therapists
      .find({ _id: { $in: people.flatMap((p) => (p.therapistId ? [p.therapistId] : [])) } })
      .toArray(),
    db.clients
      .find({ _id: { $in: people.flatMap((p) => (p.clientId ? [p.clientId] : [])) } })
      .toArray(),
  ]);
  const therapistById = new Map(therapists.map((t) => [t._id.toHexString(), t]));
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const about = (p: UserDoc): About => {
    if (p.role === "therapist") {
      const t = p.therapistId ? therapistById.get(p.therapistId.toHexString()) : undefined;
      return {
        group: "Clinicians",
        role: t ? `${t.discipline} · ${t.region}` : "Clinician",
        photoKind: "staff",
      };
    }
    if (p.role === "client") {
      const c = p.clientId ? clientById.get(p.clientId.toHexString()) : undefined;
      return {
        group: "Patients",
        role: c?.suburb ? `Patient · ${c.suburb}` : "Patient",
        photoKind: "patient",
      };
    }
    return {
      group: "Office staff",
      role: p.staffRoles?.length ? p.staffRoles.join(", ") : "Office staff",
      photoKind: "staff",
    };
  };
  return new Map(people.map((p) => [p._id.toHexString(), about(p)]));
}

async function unreadCounts(user: UserDoc, ids: ObjectId[]) {
  const { messages } = await collections();
  const rows = await messages
    .aggregate<{ _id: ObjectId; count: number }>([
      {
        $match: {
          conversationId: { $in: ids },
          senderId: { $ne: user._id },
          readBy: { $ne: user._id },
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((u) => [u._id.toHexString(), u.count]));
}

export async function listConversations(user: UserDoc): Promise<ConversationDto[]> {
  const db = await collections();
  const [rows, directs] = await Promise.all([
    db.conversations.find({ memberIds: user._id }).toArray(),
    db.directChats.find({ memberIds: user._id }).toArray(),
  ]);
  const otherIds = directs.flatMap((d) => d.memberIds.filter((m) => !m.equals(user._id)));
  const [clients, therapists, others, unreadBy] = await Promise.all([
    db.clients.find({ _id: { $in: rows.map((r) => r.clientId) } }).toArray(),
    db.therapists.find({ _id: { $in: rows.map((r) => r.therapistId) } }).toArray(),
    db.users.find({ _id: { $in: otherIds } }).toArray(),
    unreadCounts(user, [...rows.map((r) => r._id), ...directs.map((d) => d._id)]),
  ]);
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const therapistById = new Map(therapists.map((t) => [t._id.toHexString(), t]));
  const otherById = new Map(others.map((o) => [o._id.toHexString(), o]));
  const described = await describePeople(others);
  const iAmTherapist = user.role === "therapist";

  const care = rows.map((r) => {
    const therapist = therapistById.get(r.therapistId.toHexString());
    const client = clientById.get(r.clientId.toHexString());
    const dto: ConversationDto = {
      id: r._id.toHexString(),
      kind: "care",
      clientId: r.clientId.toHexString(),
      group: iAmTherapist ? "Patients" : "Clinicians",
      title: (iAmTherapist ? client?.name : therapist?.name) ?? "Conversation",
      subtitle: iAmTherapist ? (client?.suburb ?? "") : (therapist?.discipline ?? ""),
      lastMessage: r.lastMessage?.body ?? null,
      lastAt: r.lastMessage?.at.toISOString() ?? null,
      unread: unreadBy.get(r._id.toHexString()) ?? 0,
    };
    return { at: (r.lastMessage?.at ?? r.createdAt).getTime(), dto };
  });
  const direct = directs.map((d) => {
    const otherId = d.memberIds.find((m) => !m.equals(user._id))?.toHexString() ?? "";
    const dto: ConversationDto = {
      id: d._id.toHexString(),
      kind: "direct",
      clientId: "",
      group: described.get(otherId)?.group ?? "Office staff",
      title: otherById.get(otherId)?.name ?? "Conversation",
      subtitle: described.get(otherId)?.role ?? "",
      lastMessage: d.lastMessage?.body ?? null,
      lastAt: d.lastMessage?.at.toISOString() ?? null,
      unread: unreadBy.get(d._id.toHexString()) ?? 0,
    };
    return { at: (d.lastMessage?.at ?? d.createdAt).getTime(), dto };
  });
  return [...care, ...direct].sort((a, b) => b.at - a.at).map((r) => r.dto);
}

/** Everyone an admin can message, with the chat they already have with each person. */
export async function chatDirectory(user: UserDoc): Promise<ChatPersonDto[]> {
  const db = await collections();
  const [people, directs] = await Promise.all([
    db.users
      .find({
        _id: { $ne: user._id },
        disabled: { $ne: true },
        // A patient who hasn't activated their account yet has nowhere to read a message.
        $or: [{ role: { $ne: "client" } }, { passwordHash: { $ne: null } }],
      })
      .toArray(),
    db.directChats.find({ memberIds: user._id }).toArray(),
  ]);
  const chatWith = new Map(
    directs.flatMap((d) =>
      d.memberIds
        .filter((m) => !m.equals(user._id))
        .map((m) => [m.toHexString(), d._id.toHexString()] as const),
    ),
  );
  const described = await describePeople(people);
  return people
    .map((p): ChatPersonDto => {
      const id = p._id.toHexString();
      const about = described.get(id) ?? {
        group: "Office staff",
        role: "",
        photoKind: "staff",
      };
      return { id, name: p.name, ...about, conversationId: chatWith.get(id) ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const startChatSchema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose someone to message"),
});

/** Opens the admin's chat with someone, or returns the one they already have. */
export async function startDirectChat(user: UserDoc, otherId: ObjectId) {
  if (otherId.equals(user._id)) throw new UserFacingError("Choose someone else to message.");
  const db = await collections();
  const other = await db.users.findOne({ _id: otherId, disabled: { $ne: true } });
  if (!other) throw new UserFacingError("That person can't be messaged.", 404);
  const memberIds = [user._id, other._id];
  const pairKey = memberIds
    .map((m) => m.toHexString())
    .sort()
    .join(":");
  const chat = await db.directChats.findOneAndUpdate(
    { pairKey },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        memberIds,
        pairKey,
        startedBy: user._id,
        lastMessage: null,
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!chat) throw new UserFacingError("Couldn't open the chat. Try again.", 409);
  return { id: chat._id.toHexString() };
}

async function memberNames(conversation: Thread) {
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
  const { messages, conversations, directChats } = await collections();
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
  const lastMessage = { body: body.slice(0, 140), senderId: user._id, at: doc.createdAt };
  await Promise.all([
    publish(conversation.memberIds, "message", { message }),
    conversation.direct
      ? directChats.updateOne({ _id: id }, { $set: { lastMessage } })
      : conversations.updateOne({ _id: id }, { $set: { lastMessage } }),
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
  const { conversations, directChats, messages } = await collections();
  const [care, direct] = await Promise.all([
    conversations.find({ memberIds: user._id }, { projection: { _id: 1 } }).toArray(),
    directChats.find({ memberIds: user._id }, { projection: { _id: 1 } }).toArray(),
  ]);
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await messages
    .find({ conversationId: { $in: [...care, ...direct].map((c) => c._id) }, body: pattern })
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
