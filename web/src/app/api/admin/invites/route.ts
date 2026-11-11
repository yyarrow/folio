import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { langFromRequest } from "@/lib/i18n";
import { requestT } from "@/lib/server-messages";
import { createInviteForEmail, decryptInviteCode, findUserByEmail, isEmail, isSameOrigin, normalizeEmail, requireOwner } from "@/lib/auth";
import { database, ensureSchema } from "@/lib/db";
import { inviteKind, inviteStatus, parseInviteMessage } from "@/lib/invites";
import { assertEmailConfigured, sendInviteEmail } from "@/lib/email";

export async function POST(request: Request) {
  const t = requestT(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: t("api.invalidOrigin") }, { status: 403 });
  }
  const owner = await requireOwner(request);
  if (owner instanceof Response) return owner;

  const body = await request.json().catch(() => null) as { email?: unknown; message?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) {
    return NextResponse.json({ error: t("api.invalidEmail") }, { status: 400 });
  }

  try {
    assertEmailConfigured();
    await ensureSchema();
    const sql = await database();
    if (await findUserByEmail(email)) {
      return NextResponse.json({ error: t("api.emailHasAccount") }, { status: 409 });
    }
    await sql`
      INSERT INTO folio_waitlist (id, email, note)
      VALUES (${`wl_${randomBytes(12).toString("hex")}`}, ${email}, NULL)
      ON CONFLICT (email) DO NOTHING
    `;
    const code = await createInviteForEmail(email);
    const previewUrl = await sendInviteEmail(email, code, langFromRequest(request), parseInviteMessage(body?.message));
    return NextResponse.json({ ok: true, previewUrl });
  } catch (error) {
    console.error("invite failed", error);
    return NextResponse.json({ error: t("api.inviteFailed") }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const owner = await requireOwner(request);
  if (owner instanceof Response) return owner;
  await ensureSchema();
  const sql = await database();
  const rows = await sql`
    SELECT id, email, kind, code_enc, created_at, expires_at, used_at
    FROM folio_invites
    ORDER BY created_at DESC
    LIMIT 50
  ` as { id: string; email: string | null; kind: string | null; code_enc: string | null; created_at: string; expires_at: string; used_at: string | null }[];
  return NextResponse.json({
    invites: rows.map((row) => {
      const status = inviteStatus({ usedAt: row.used_at, expiresAt: row.expires_at });
      return {
      id: row.id,
      // Only unused codes are worth showing again.
      code: status === "unused" ? decryptInviteCode(row.code_enc) : null,
      email: row.email,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
      status,
      kind: inviteKind(row.kind),
      };
    }),
  });
}
