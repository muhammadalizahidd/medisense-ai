import { MongoClient, ObjectId } from "mongodb";
import { agent } from "./lib.mjs";
const PW = process.env.SEED_PASSWORD;
const admin = agent(), emma = agent(), patient = agent();
await admin("/api/auth/login", { body: { email: "jo.marsh@medisense.test", password: PW } });
await emma("/api/auth/login", { body: { email: "emma.clarke@medisense.test", password: PW } });

// 1. Emma sets availability: Mon, Wed, Thu 9-3, away all of next week's Tuesday-Friday
const today = new Date(); const day = (n) => new Date(today.getTime() + n * 864e5 + 10 * 36e5).toISOString().slice(0, 10);
const saved = await emma("/api/me/availability", { method: "PUT", body: { weekly: [{ weekday: 1, start: 540, end: 900 }, { weekday: 3, start: 540, end: 900 }, { weekday: 4, start: 540, end: 900 }], timeOff: [{ from: day(1), to: day(3), reason: "Annual leave" }] } });
console.log("1. availability saved:", saved.availability.pattern, "| away:", saved.availability.away.map((a) => `${a.from}..${a.to} ${a.reason}`).join(", "), "| clashes:", saved.clashes.length);
const bad = await emma.raw("/api/me/availability", { method: "PUT", body: { weekly: [{ weekday: 2, start: 600, end: 630 }], timeOff: [] } });
console.log("2. too-short day rejected:", bad.status, bad.data.error);

// 3. admin adds patient, sees Emma's availability and slots respect it
const email = `journey.test.${Date.now()}@example.test`;
const c = await admin("/api/care/clients", { body: { name: "Test Ava Brooks", dateOfBirth: "2017-04-02", email, phone: null, suburb: "Kedron", region: "Brisbane North", funding: "NDIS", needs: [{ discipline: "Occupational Therapy", frequency: "Weekly" }], notes: "Journey test record." } });
const { matches } = await admin(`/api/care/clients/${c.id}/matches?discipline=Occupational%20Therapy`);
const m = matches.find((x) => x.name === "Emma Clarke");
const days = m.slots.map((s) => new Date(new Date(s).getTime() + 10 * 36e5));
const wd = days.map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()]);
const lateEnough = days.every((d) => d.getUTCHours() * 60 + d.getUTCMinutes() + 60 <= 900);
const awayOk = m.slots.every((s) => { const k = new Date(new Date(s).getTime() + 10 * 36e5).toISOString().slice(0, 10); return k < day(1) || k > day(3); });
console.log("3. admin sees:", m.availability.pattern, "| away", m.availability.away.length, "| slot days", [...new Set(wd)].join(","), "| within hours:", lateEnough, "| none during leave:", awayOk);
const ther = await admin("/api/care/therapists");
console.log("4. therapist directory:", ther.therapists.length, "therapists; Emma:", ther.therapists.find((t) => t.name === "Emma Clarke").availability.pattern);

// accept + series
await admin(`/api/care/clients/${c.id}/requests`, { body: { discipline: "Occupational Therapy", therapistId: m.therapistId, start: m.slots[0] } });
const req = (await emma("/api/care/therapist")).requests.find((r) => r.clientId === c.id);
const acc = await emma(`/api/care/requests/${req.id}`, { body: { decision: "accept" } });
console.log("5. accepted; series booked", acc.booked, "skipped", acc.skipped);
await patient("/api/auth/activate", { body: { email, code: c.inviteCode, password: "journey-test-pass-1" } });

// move first visit into the past (test only), then complete, note, feedback
const db = new MongoClient(process.env.CONNECTION_STRING); await db.connect();
const appts = db.db("Medisense").collection("appointments");
const first = await appts.find({ clientId: new ObjectId(c.id), status: "booked" }).sort({ start: 1 }).limit(1).next();
await appts.updateOne({ _id: first._id }, { $set: { start: new Date(Date.now() - 26 * 36e5), end: new Date(Date.now() - 25 * 36e5) } });
const vid = first._id.toHexString();
const early = await patient.raw(`/api/visits/${vid}/feedback`, { body: { rating: 5, comment: "Great" } });
console.log("6. rating before completion refused:", early.status);
await emma(`/api/visits/${vid}/outcome`, { body: { outcome: "completed" } });
let home = await emma("/api/care/therapist");
console.log("7. completed; Emma's notes to write:", home.notesToWrite.length);
await emma(`/api/visits/${vid}/note`, { body: { text: "Worked on fine motor grasp with putty and pegs; tolerated 20 min seated tasks. Mother present. Plan: theraputty home program 5 min daily.", forPatient: "Ava worked hard on hand strength today. Please practise the putty game for 5 minutes each day." } });
home = await emma("/api/care/therapist");
console.log("8. note written; notes left:", home.notesToWrite.length);
const pv = (await patient("/api/visits")).visits.find((v) => v.id === vid);
console.log("9. patient sees summary:", JSON.stringify(pv.note.forPatient.slice(0, 40)), "| clinical text hidden:", pv.note.text === null);
const me = await patient("/api/care/me");
console.log("10. patient home asks to rate:", me.toRate.length);
await patient(`/api/visits/${vid}/feedback`, { body: { rating: 5, comment: "Emma was lovely and Ava loved the games." } });
const twice = await patient.raw(`/api/visits/${vid}/feedback`, { body: { rating: 1, comment: "" } });
console.log("11. feedback saved; second rating refused:", twice.status, twice.data.error);
const det = (await admin(`/api/care/therapists/${m.therapistId}`)).therapist;
console.log("12. Emma's profile: rating", JSON.stringify(det.rating), "| completed", det.stats.completed, "| patients", det.patients.length, "| feedback:", det.feedback[0]?.comment);
await patient("/api/care/me", { method: "PUT", body: { phone: "0400 000 000", emergencyContact: { name: "Kim Brooks", relationship: "Mother", phone: "0400 111 222" } } });
// discharge
const dis = await emma(`/api/care/clients/${c.id}/discharge`, { body: { reason: "Goals met" } });
const after = await admin(`/api/care/clients/${c.id}`);
const emmaAfter = (await admin("/api/care/therapists")).therapists.find((t) => t.name === "Emma Clarke");
console.log("13. discharged:", JSON.stringify(dis), "| stage", after.client.stage, "| emergency contact", after.client.emergencyContact?.name, "| Emma active", emmaAfter.activeClients);
const again = await admin.raw(`/api/care/clients/${c.id}/discharge`, { body: { reason: "Other" } });
console.log("14. discharging twice refused:", again.status);
console.log("15. patient notified:", (await patient("/api/notifications")).notifications.map((n) => n.title).slice(0, 4).join(" | "));
console.log("16. history:", after.client.activity.map((a) => a.action).slice(0, 7).join(" | "));
// restore Emma's availability to the seeded Mon-Fri
await emma("/api/me/availability", { method: "PUT", body: { weekly: [1,2,3,4,5].map((weekday) => ({ weekday, start: 540, end: 1020 })), timeOff: [] } });
await db.close();
