import { NextResponse } from "next/server";
import { langFromRequest } from "@/lib/i18n";
import { requestT } from "@/lib/server-messages";
import { createInviteForEmail, isEmail, isSameOrigin, normalizeEmail, requireOwner } from "@/lib/auth";
import { database, ensureSchema } from "@/lib/db";
import { assertEmailConfigured, sendInviteEmail } from "@/lib/email";

export async function POST(request: Request) {
  const t = requestT(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: t("api.invalidOrigin") }, { status: 403 });
  }
  const owner = await requireOwner(request);
  if (owner instanceof Response) return owner;

  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) {
    return NextResponse.json({ error: t("api.invalidEmail") }, { status: 400 });
  }

  try {
    assertEmailConfigured();
    await ensureSchema();
    const sql = await database();
    const rows = await sql`SELECT 1 FROM folio_waitlist WHERE email = ${email} LIMIT 1` as unknown[];
    if (!rows[0]) {
      return NextResponse.json({ error: t("api.notOnWaitlist") }, { status: 404 });
    }
    const code = await createInviteForEmail(email);
    const previewUrl = await sendInviteEmail(email, code, langFromRequest(request));
    return NextResponse.json({ ok: true, previewUrl });
  } catch (error) {
    console.error("invite failed", error);
    return NextResponse.json({ error: t("api.inviteFailed") }, { status: 503 });
  }
}
