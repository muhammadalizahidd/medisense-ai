import { ObjectId, type ChangeStream, type ChangeStreamInsertDocument } from "mongodb";
import { AuthError, requireUser } from "@/server/auth";
import { collections, DatabaseUnavailable } from "@/server/db";
import type { EventDoc } from "@/server/models";

const HEARTBEAT_MS = 25_000;
const POLL_MS = 2_000;

/**
 * One stream per signed-in person. Changes arrive through a MongoDB change stream; if that isn't
 * available the route polls instead. Browsers reconnect on their own when a stream ends.
 */
export async function GET(request: Request) {
  let user;
  let events;
  try {
    user = await requireUser();
    ({ events } = await collections());
  } catch (error) {
    if (error instanceof AuthError) return new Response(null, { status: error.status });
    if (error instanceof DatabaseUnavailable) return new Response(null, { status: 503 });
    throw error;
  }
  const userId = user._id;
  const encoder = new TextEncoder();
  let watcher: ChangeStream<EventDoc> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stop = () => {
    closed = true;
    clearInterval(heartbeat);
    clearInterval(poll);
    void watcher?.close().catch(() => undefined);
    watcher = null;
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      const send = (type: string, payload: unknown) =>
        write(`data: ${JSON.stringify({ type, payload })}\n\n`);

      const startPolling = () => {
        let lastId = new ObjectId();
        poll = setInterval(async () => {
          try {
            const rows = await events
              .find({ userIds: userId, _id: { $gt: lastId } })
              .sort({ _id: 1 })
              .limit(50)
              .toArray();
            for (const row of rows) {
              lastId = row._id;
              send(row.type, row.payload);
            }
          } catch {
            write(": waiting for database\n\n");
          }
        }, POLL_MS);
      };

      write("retry: 3000\n\n");
      send("connected", {});
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      try {
        watcher = events.watch<EventDoc, ChangeStreamInsertDocument<EventDoc>>([
          { $match: { operationType: "insert", "fullDocument.userIds": userId } },
        ]);
        watcher.on("change", (change) => {
          if (change.operationType === "insert") {
            send(change.fullDocument.type, change.fullDocument.payload);
          }
        });
        watcher.on("error", () => {
          void watcher?.close().catch(() => undefined);
          watcher = null;
          if (!closed && !poll) startPolling();
        });
      } catch {
        startPolling();
      }

      request.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      });
    },
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
