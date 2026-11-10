import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.CONNECTION_STRING); await c.connect();
const db = c.db("Medisense");
const a = await db.collection("assignments").findOne({ status: "pending" });
const t = await db.collection("therapists").findOne({ _id: a.therapistId });
const v = await db.collection("appointments").findOne({ _id: a.appointmentId });
const n = await db.collection("notifications").find({ userId: t.userId }).sort({ createdAt: -1 }).limit(1).toArray();
console.log(`request to ${t.name} (${t.discipline}, ${t.region}) | visit ${v.status}, holds slot: ${v.holdsSlot}, ${v.start.toISOString()} | therapist notified: "${n[0]?.title}"`);
await c.close();
