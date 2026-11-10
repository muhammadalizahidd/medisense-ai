import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.CONNECTION_STRING); await c.connect();
const db = c.db("Medisense");
const tests = await db.collection("clients").find({ name: /^Test /, notes: /test record/i }).toArray();
for (const client of tests) {
  const convs = await db.collection("conversations").find({ clientId: client._id }).toArray();
  const accepted = await db.collection("assignments").find({ clientId: client._id, status: "accepted" }).toArray();
  if (!client.discharged) for (const a of accepted) await db.collection("therapists").updateOne({ _id: a.therapistId }, { $inc: { activeClients: -1 } });
  await db.collection("messages").deleteMany({ conversationId: { $in: convs.map((x) => x._id) } });
  for (const col of ["conversations", "assignments", "appointments", "audit"]) await db.collection(col).deleteMany({ clientId: client._id });
  await db.collection("notifications").deleteMany({ $or: [{ userId: client.userId }, { title: new RegExp(client.name) }, { body: new RegExp(client.name) }] });
  await db.collection("sessions").deleteMany({ userId: client.userId });
  await db.collection("users").deleteOne({ _id: client.userId });
  await db.collection("clients").deleteOne({ _id: client._id });
  console.log("removed", client.name);
}
const weekly = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 540, end: 1020 }));
await db.collection("therapists").updateOne({ slug: "emma-clarke" }, { $set: { weekly, timeOff: [] } });
await db.collection("audit").deleteMany({ action: "Updated working hours and time off" });
await db.collection("events").deleteMany({});
await db.collection("sessions").deleteMany({});
const t = await db.collection("therapists").find().toArray();
const emma = t.find((x) => x.slug === "emma-clarke");
console.log("Emma:", emma.activeClients, "clients,", emma.weekly.length, "days, time off", emma.timeOff.length, "| total active", t.reduce((s, x) => s + x.activeClients, 0), "| patients", await db.collection("clients").countDocuments());
await c.close();
