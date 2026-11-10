import "server-only";
import type { ClientHomeDto } from "@/lib/live/types";
import { collections } from "./db";
import { appointmentDto, nameMap, needDtos } from "./dto";
import { UserFacingError } from "./http";
import type { UserDoc } from "./models";

export async function clientHome(user: UserDoc): Promise<ClientHomeDto> {
  const db = await collections();
  const client = user.clientId ? await db.clients.findOne({ _id: user.clientId }) : null;
  if (!client) throw new UserFacingError("No client record is linked to this account.", 404);
  const [team, visits, conversations] = await Promise.all([
    db.therapists.find({}, { projection: { name: 1 } }).toArray(),
    db.appointments
      .find({ clientId: client._id, status: "booked", start: { $gte: new Date() } })
      .sort({ start: 1 })
      .limit(10)
      .toArray(),
    db.conversations.find({ clientId: client._id }).toArray(),
  ]);
  const names = nameMap(team);
  const chatByTherapist = new Map(
    conversations.map((c) => [c.therapistId.toHexString(), c._id.toHexString()]),
  );
  return {
    name: client.name,
    needs: needDtos(client, names),
    team: client.needs.flatMap((n) =>
      n.status === "assigned" && n.therapistId
        ? [
            {
              therapistName: names.get(n.therapistId.toHexString()) ?? "Your therapist",
              discipline: n.discipline,
              conversationId: chatByTherapist.get(n.therapistId.toHexString()) ?? null,
            },
          ]
        : [],
    ),
    upcoming: visits.map((v) => appointmentDto(v, nameMap([client]), names)),
  };
}
