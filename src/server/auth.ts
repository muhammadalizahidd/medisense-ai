import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { collections } from "./db";
import type { UserDoc, UserRole } from "./models";

export const SESSION_COOKIE = "medisense_session";
const SESSION_DAYS = 14;
const INVITE_DAYS = 14;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 11);

/** Compares against a dummy hash when there's no user, so timing doesn't reveal which emails exist. */
let dummyHash: string | null = null;
export async function checkPassword(user: UserDoc | null, password: string) {
  dummyHash ??= await bcrypt.hash(randomBytes(16).toString("hex"), 11);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  return Boolean(user?.passwordHash) && ok;
}

export async function startSession(userId: ObjectId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { sessions } = await collections();
  await sessions.insertOne({ _id: sha256(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const { sessions } = await collections();
    await sessions.deleteOne({ _id: sha256(token) });
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in person, or null. */
export async function currentUser(): Promise<UserDoc | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { sessions, users } = await collections();
  const session = await sessions.findOne({ _id: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return users.findOne({ _id: session.userId });
}

export class AuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Please sign in." : "You don't have access to this.");
  }
}

export async function requireUser(...roles: UserRole[]) {
  const user = await currentUser();
  if (!user) throw new AuthError(401);
  if (roles.length && !roles.includes(user.role)) throw new AuthError(403);
  return user;
}

/** An 8-character code without look-alike characters, shown to the admin once. */
export function newInviteCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return {
    code,
    invite: { codeHash: sha256(code), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  };
}

export function inviteMatches(user: UserDoc, code: string) {
  if (!user.invite || user.invite.expiresAt < new Date()) return false;
  return user.invite.codeHash === sha256(code.trim().toUpperCase());
}

/** A small per-process limit on sign-in attempts per address. */
const attempts = new Map<string, { count: number; until: number }>();
export function allowAttempt(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) {
    attempts.set(key, { count: 1, until: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 8;
}
