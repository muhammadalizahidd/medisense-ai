import { createTaskSchema } from "@/lib/live/coord";
import { cached, cacheKey } from "@/server/cache";
import { requireUser } from "@/server/auth";
import { createTask, taskList } from "@/server/coord";
import { ensureCoordSeed } from "@/server/coord-seed";
import { collections } from "@/server/db";
import { handle, readJson } from "@/server/http";

/** Module 17: tasks, the care team and the choices for a new task. */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      const user = await requireUser("admin", "therapist");
      await ensureCoordSeed();
      const db = await collections();
      const clients = await db.clients
        .find(
          user.role === "therapist"
            ? { "needs.therapistId": user.therapistId ?? null }
            : { "needs.therapistId": { $ne: null } },
          { projection: { name: 1, needs: 1 } },
        )
        .limit(120)
        .toArray();
      const staff = await db.users
        .find(
          { role: { $in: ["therapist", "admin"] }, active: { $ne: false } },
          { projection: { name: 1, role: 1, staffRoles: 1 } },
        )
        .toArray();
      return {
        ...(await taskList(user)),
        options: {
          participants: clients.map((c) => ({
            clientId: c._id.toHexString(),
            name: c.name,
            needs: c.needs
              .filter((n) => n.therapistId)
              .map((n) => ({ id: n.id, discipline: n.discipline })),
          })),
          staff: staff.map((s) => ({
            id: s._id.toHexString(),
            name: s.name,
            role: s.role === "therapist" ? "Clinician" : (s.staffRoles ?? []).join(", ") || "Admin",
          })),
        },
      };
    }),
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return createTask(user, await readJson(request, createTaskSchema));
  });
}
