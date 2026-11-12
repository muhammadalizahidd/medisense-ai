#!/usr/bin/env node
// Sets every demo staff account (@medisense.test, admins and therapists) to SEED_PASSWORD.
// Seeding only runs on an empty database, so use this after changing SEED_PASSWORD.
// Usage: pnpm demo:passwords   (reads CONNECTION_STRING, MONGODB_DB and SEED_PASSWORD from .env.local)
import { existsSync, readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const uri = env.CONNECTION_STRING ?? env.MONGODB_URI;
const password = env.SEED_PASSWORD;
if (!uri) throw new Error("CONNECTION_STRING is not set.");
if (!password || password.length < 10) throw new Error("SEED_PASSWORD needs at least 10 characters.");

const client = await MongoClient.connect(uri);
try {
  const users = client.db(env.MONGODB_DB ?? "Medisense").collection("users");
  const passwordHash = await bcrypt.hash(password, 11);
  const result = await users.updateMany(
    { role: { $in: ["admin", "therapist"] }, email: /@medisense\.test$/ },
    { $set: { passwordHash } },
  );
  console.log(`Updated ${result.modifiedCount} of ${result.matchedCount} demo staff accounts.`);
} finally {
  await client.close();
}
