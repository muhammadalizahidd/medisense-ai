import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.CONNECTION_STRING); await c.connect();
const db = c.db("Medisense");
const qasim = await db.collection("clients").findOne({ name: "Qasim Ali" });
if (!qasim) { console.log("Qasim not found"); process.exit(1); }
const booked = await db.collection("appointments").find({ clientId: qasim._id, status: "booked", start: { $gt: new Date() } }).sort({ start: -1 }).toArray();
const visit = booked[0];
if (!visit) { console.log("no future booked visit"); process.exit(1); }
const t = await db.collection("therapists").findOne({ _id: visit.therapistId });
const hour = 3_600_000;
const start = new Date(Math.floor((Date.now() - 2 * hour) / hour) * hour);
const end = new Date(start.getTime() + t.sessionMinutes * 60_000);
const fmt = (d) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
await db.collection("appointments").updateOne({ _id: visit._id }, { $set: { start, end } });
console.log(`moved ${t.name}'s visit with ${qasim.name} from ${fmt(visit.start)} to ${fmt(start)} (Brisbane), status: ${visit.status}`);
await c.close();
