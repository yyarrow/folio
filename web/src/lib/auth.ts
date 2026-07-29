import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { database, ensureSchema, hasDatabase } from "./db";

const COOKIE_NAME = "folio_session";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LOGIN_TTL_MS = 15 * 60 * 1000;
const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const DEVICE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

type UserRow = { id: string; email: string };

function authSecret(): string {
  return process.env.FOLIO_SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "folio-local-development");
}

function inviteCode(): string {
  return process.env.FOLIO_ACCESS_KEY ?? (process.env.NODE_ENV === "production" ? "" : "folio");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secureDigest(value: string): Buffer {
  return createHmac("sha256", authSecret()).update(value).digest();
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function isAuthConfigured(): boolean {
  return hasDatabase() && Boolean(authSecret() && inviteCode());
}

export function verifyInviteCode(candidate: string): boolean {
  if (!authSecret() || !inviteCode()) return false;
  const expected = secureDigest(inviteCode());
  const actual = secureDigest(candidate.trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function userFromSessionToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token || !isAuthConfigured()) return null;
  await ensureSchema();
  const sql = await database();
  const rows = await sql`
    SELECT u.id, u.email
    FROM folio_sessions s
    JOIN folio_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()
    LIMIT 1
  ` as UserRow[];
  return rows[0] ?? null;
}

async function userFromDeviceToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token || !isAuthConfigured()) return null;
  await ensureSchema();
  const sql = await database();
  const tokenHash = hashToken(token);
  const rows = await sql`
    UPDATE folio_devices d
    SET last_seen_at = now()
    FROM folio_users u
    WHERE d.token_hash = ${tokenHash}
      AND d.user_id = u.id
      AND d.expires_at > now()
    RETURNING u.id, u.email
  ` as UserRow[];
  return rows[0] ?? null;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? userFromSessionToken(token) : null;
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return userFromDeviceToken(authorization.slice(7));
  }
  return getCurrentUser();
}

export async function createSession(userId: string): Promise<void> {
  await ensureSchema();
  const sql = await database();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sql`INSERT INTO folio_sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`;
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token && isAuthConfigured()) {
    await ensureSchema();
    const sql = await database();
    await sql`DELETE FROM folio_sessions WHERE token_hash = ${hashToken(token)}`;
  }
  store.delete(COOKIE_NAME);
}

export async function findUserByEmail(email: string): Promise<AuthenticatedUser | null> {
  await ensureSchema();
  const sql = await database();
  const rows = await sql`SELECT id, email FROM folio_users WHERE email = ${email} LIMIT 1` as UserRow[];
  return rows[0] ?? null;
}

export async function createUser(email: string): Promise<AuthenticatedUser> {
  await ensureSchema();
  const sql = await database();
  const id = `user_${randomBytes(16).toString("hex")}`;
  await sql`INSERT INTO folio_users (id, email) VALUES (${id}, ${email}) ON CONFLICT (email) DO NOTHING`;
  const user = await findUserByEmail(email);
  if (!user) throw new Error("Unable to create user");
  return user;
}

export async function issueLoginToken(userId: string): Promise<string> {
  await ensureSchema();
  const sql = await database();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + LOGIN_TTL_MS);
  await sql`DELETE FROM folio_login_tokens WHERE user_id = ${userId}`;
  await sql`INSERT INTO folio_login_tokens (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`;
  return token;
}

export async function consumeLoginToken(token: string): Promise<string | null> {
  if (!token) return null;
  await ensureSchema();
  const sql = await database();
  const rows = await sql`
    UPDATE folio_login_tokens
    SET used_at = now()
    WHERE token_hash = ${hashToken(token)} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  ` as { user_id: string }[];
  if (!rows[0]) return null;
  await sql`UPDATE folio_users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${rows[0].user_id}`;
  return rows[0].user_id;
}

export async function checkRateLimit(kind: string, value: string, limit: number, windowSeconds: number): Promise<boolean> {
  await ensureSchema();
  const sql = await database();
  const key = createHmac("sha256", authSecret()).update(`${kind}:${value}`).digest("hex");
  const expiresAt = new Date(Date.now() + windowSeconds * 1000);
  const rows = await sql`
    INSERT INTO folio_rate_limits (key, count, expires_at)
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN folio_rate_limits.expires_at <= now() THEN 1 ELSE folio_rate_limits.count + 1 END,
      expires_at = CASE WHEN folio_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE folio_rate_limits.expires_at END
    RETURNING count
  ` as { count: number }[];
  return Number(rows[0]?.count ?? limit + 1) <= limit;
}

function createReadableCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => DEVICE_ALPHABET[byte % DEVICE_ALPHABET.length]).join("");
}

export async function createDeviceCode(userId: string): Promise<{ code: string; expiresAt: string }> {
  await ensureSchema();
  const sql = await database();
  const code = createReadableCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);
  await sql`DELETE FROM folio_device_codes WHERE user_id = ${userId}`;
  await sql`INSERT INTO folio_device_codes (code_hash, user_id, expires_at) VALUES (${hashToken(code)}, ${userId}, ${expiresAt})`;
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function exchangeDeviceCode(candidate: string): Promise<{ token: string; userId: string } | null> {
  const code = candidate.trim().toUpperCase().replace(/[^2-9A-Z]/gu, "");
  if (code.length !== 8) return null;
  await ensureSchema();
  const sql = await database();
  const rows = await sql`
    UPDATE folio_device_codes
    SET used_at = now()
    WHERE code_hash = ${hashToken(code)} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  ` as { user_id: string }[];
  const userId = rows[0]?.user_id;
  if (!userId) return null;
  const token = randomToken();
  const expiresAt = new Date(Date.now() + DEVICE_TTL_MS);
  await sql`INSERT INTO folio_devices (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`;
  return { token, userId };
}

export async function revokeDeviceToken(request: Request): Promise<void> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !isAuthConfigured()) return;
  await ensureSchema();
  const sql = await database();
  await sql`DELETE FROM folio_devices WHERE token_hash = ${hashToken(authorization.slice(7))}`;
}

export async function deleteAccount(userId: string): Promise<void> {
  await ensureSchema();
  const sql = await database();
  await sql.transaction((transaction) => [
    transaction`DELETE FROM folio_notes WHERE user_id = ${userId}`,
    transaction`DELETE FROM folio_users WHERE id = ${userId}`,
  ]);
  (await cookies()).delete(COOKIE_NAME);
}
