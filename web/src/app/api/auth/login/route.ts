import { NextResponse } from "next/server";
import { createSession, isAuthConfigured, verifyAccessKey } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Folio 尚未配置访问密钥。" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { accessKey?: unknown };
  if (typeof body.accessKey !== "string" || !verifyAccessKey(body.accessKey)) {
    return NextResponse.json({ error: "访问密钥不正确。" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
