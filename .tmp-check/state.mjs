import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.CONNECTION_STRING); await c.connect();
const db = c.db("Medisense");
const patients = await db.collection("clients").find().sort({ createdAt: -1 }).toArray();
console.log("patients:", patients.length);
for (const p of patients.slice(0, 5)) {
  const u = await db.collection("users").findOne({ _id: p.userId });
  const visits = await db.collection("appointments").countDocuments({ clientId: p._id, holdsSlot: true });
  console.log(`- ${p.name} | ${p.funding} | ${p.region} | needs: ${p.needs.map((n) => `${n.discipline} (${n.frequency}) ${n.status}`).join(", ")} | app: ${u?.passwordHash ? "active" : "invited"} | visits held: ${visits}${p.discharged ? " | DISCHARGED" : ""}`);
}
const pending = await db.collection("assignments").countDocuments({ status: "pending" });
const convs = await db.collection("conversations").countDocuments();
const msgs = await db.collection("messages").countDocuments();
console.log(`pending requests: ${pending} | conversations: ${convs} | messages: ${msgs}`);
await c.close();
