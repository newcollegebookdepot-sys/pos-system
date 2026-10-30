import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "pos_session";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

let cachedSecret: string | null = null;

function sessionSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  // Offline / local shop: persist a secret next to the DB (works for next start too).
  // Cloud hosts without a writable disk should set SESSION_SECRET in the environment.
  if (process.env.VERCEL === "1" && process.env.POS_USE_TURSO === "1") {
    throw new Error(
      "SESSION_SECRET is required when running on Vercel with Turso. Set it in project Environment Variables.",
    );
  }

  const file = path.join(process.cwd(), "data", "session.secret");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, randomBytes(32).toString("base64url"));
  }
  const secret = fs.readFileSync(file, "utf8").trim();
  if (!secret) throw new Error("The session secret file is empty.");
  cachedSecret = secret;
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function setSession(userId: number) {
  const exp = Date.now() + TWELVE_HOURS;
  const payload = Buffer.from(JSON.stringify({ userId, exp })).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(exp),
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readSession(): Promise<{ userId: number } | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.userId !== "number" || !Number.isInteger(parsed.userId) || parsed.userId < 1) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}
