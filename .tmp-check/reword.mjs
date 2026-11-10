import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.CONNECTION_STRING); await c.connect();
const db = c.db("Medisense");
const a = await db.collection("appointments").updateMany({ "cancellation.reason": "No-show" }, { $set: { "cancellation.reason": "Did not attend" } });
const logs = await db.collection("audit").find({ action: /^Recorded a no-show for the visit on / }).toArray();
for (const l of logs) {
  const when = l.action.replace("Recorded a no-show for the visit on ", "");
  await db.collection("audit").updateOne({ _id: l._id }, { $set: { action: `Recorded the visit on ${when} as did not attend` } });
}
console.log(`visits reworded: ${a.modifiedCount} | history entries reworded: ${logs.length}`);
await c.close();
