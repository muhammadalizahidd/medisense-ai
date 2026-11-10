import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.CONNECTION_STRING); await c.connect();
const db = c.db("Medisense");
const qasim = await db.collection("clients").findOne({ name: "Qasim Ali" });
const booked = await db.collection("appointments").find({ clientId: qasim._id, status: "booked", start: { $gt: new Date() } }).sort({ start: -1 }).limit(2).toArray();
if (booked.length < 2) { console.log("not enough future visits"); process.exit(1); }
const t = await db.collection("therapists").findOne({ _id: booked[0].therapistId });
// Yesterday in Brisbane (UTC+10), at 10:00 and 14:00.
const nowBris = new Date(Date.now() + 10 * 3_600_000);
const y = Date.UTC(nowBris.getUTCFullYear(), nowBris.getUTCMonth(), nowBris.getUTCDate() - 1);
const at = (hour) => new Date(y + (hour - 10) * 3_600_000);
const fmt = (d) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
for (const [i, hour] of [[1, 10], [0, 14]]) {
  const v = booked[i];
  const start = at(hour);
  const end = new Date(start.getTime() + t.sessionMinutes * 60_000);
  await db.collection("appointments").updateOne({ _id: v._id }, { $set: { start, end } });
  console.log(`moved ${fmt(v.start)} -> ${fmt(start)} (still booked, waiting for Attended)`);
}
await c.close();
