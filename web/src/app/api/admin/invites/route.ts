import { NextResponse } from "next/server";
import { createInviteForEmail, isEmail, isSameOrigin, normalizeEmail, requireOwner } from "@/lib/auth";
import { database, ensureSchema } from "@/lib/db";
import { assertEmailConfigured, sendInviteEmail } from "@/lib/email";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  const owner = await requireOwner(request);
  if (owner instanceof Response) return owner;

  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) {
    return NextResponse.json({ error: "请输入有效邮箱。" }, { status: 400 });
  }

  try {
    assertEmailConfigured();
    await ensureSchema();
    const sql = await database();
    const rows = await sql`SELECT 1 FROM folio_waitlist WHERE email = ${email} LIMIT 1` as unknown[];
    if (!rows[0]) {
      return NextResponse.json({ error: "该邮箱不在等候名单中。" }, { status: 404 });
    }
    const code = await createInviteForEmail(email);
    const previewUrl = await sendInviteEmail(email, code);
    return NextResponse.json({ ok: true, previewUrl });
  } catch (error) {
    console.error("invite failed", error);
    return NextResponse.json({ error: "暂时无法发送邀请，请稍后再试。" }, { status: 503 });
  }
}
