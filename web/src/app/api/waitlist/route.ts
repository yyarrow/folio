import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requestT } from "@/lib/server-messages";
import { checkRateLimit, isAuthConfigured, isEmail, isSameOrigin, normalizeEmail } from "@/lib/auth";
import { database, ensureSchema } from "@/lib/db";
import { parseWaitlistNote } from "@/lib/invites";

export async function POST(request: Request) {
  const t = requestT(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: t("api.invalidOrigin") }, { status: 403 });
  }
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: t("api.authNotConfigured") }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { email?: unknown; note?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) {
    return NextResponse.json({ error: t("api.invalidEmail") }, { status: 400 });
  }
  const note = parseWaitlistNote(body?.note);

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [allowedByIp, allowedByEmail] = await Promise.all([
    checkRateLimit("waitlist-ip", forwarded, 10, 60 * 60),
    checkRateLimit("waitlist-email", email, 3, 60 * 60),
  ]);
  if (!allowedByIp || !allowedByEmail) {
    return NextResponse.json({ error: t("api.rateLimited") }, { status: 429 });
  }

  try {
    await ensureSchema();
    const sql = await database();
    await sql`
      INSERT INTO folio_waitlist (id, email, note)
      VALUES (${`wl_${randomBytes(12).toString("hex")}`}, ${email}, ${note})
      ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("waitlist failed", error);
    return NextResponse.json({ error: t("api.waitlistFailed") }, { status: 503 });
  }
}
