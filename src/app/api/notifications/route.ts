import { requireUser } from "@/server/auth";
import { collections } from "@/server/db";
import { notificationDto } from "@/server/dto";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const { notifications } = await collections();
    const rows = await notifications
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();
    return { notifications: rows.map(notificationDto) };
  });
}

/** Marks everything read when the person opens the list. */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const { notifications } = await collections();
    await notifications.updateMany({ userId: user._id, read: false }, { $set: { read: true } });
    return { ok: true };
  });
}
