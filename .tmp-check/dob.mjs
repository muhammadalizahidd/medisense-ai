import { agent } from "./lib.mjs";
const admin = agent();
await admin("/api/auth/login", { body: { email: "jo.marsh@medisense.test", password: process.env.SEED_PASSWORD } });
const r = await admin.raw("/api/care/clients", { body: { name: "Test Future Birth", dateOfBirth: "2030-01-01", email: `dob.${Date.now()}@example.test`, phone: null, suburb: "Kedron", region: "Brisbane North", funding: "NDIS", needs: [{ discipline: "Physiotherapy", frequency: "Weekly" }], notes: "test record" } });
console.log("future date of birth:", r.status, r.data.error);
