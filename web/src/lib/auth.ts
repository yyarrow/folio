import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "folio_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 90;

function accessKey(): string {
  return process.env.FOLIO_ACCESS_KEY ?? (process.env.NODE_ENV === "production" ? "" : "folio");
}

function sessionSecret(): string {
  return process.env.FOLIO_SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "folio-local-development");
}

function sessionValue(): string {
  return createHmac("sha256", sessionSecret()).update(accessKey()).digest("base64url");
}

export function isAuthConfigured(): boolean {
  return Boolean(accessKey() && sessionSecret());
}

export function verifyAccessKey(candidate: string): boolean {
  if (!isAuthConfigured()) return false;
  const expected = Buffer.from(sessionValue());
  const actual = Buffer.from(
    createHmac("sha256", sessionSecret()).update(candidate).digest("base64url"),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  const candidate = (await cookies()).get(COOKIE_NAME)?.value;
  if (!candidate) return false;
  const expected = Buffer.from(sessionValue());
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, sessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_AGE_SECONDS,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
