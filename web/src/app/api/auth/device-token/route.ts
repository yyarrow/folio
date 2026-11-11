import { NextResponse } from "next/server";
import { requestT } from "@/lib/server-messages";
import { exchangeDeviceCode, revokeDeviceToken } from "@/lib/auth";
import { extensionCorsHeaders } from "@/lib/cors";

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: extensionCorsHeaders(request) });
}

export async function POST(request: Request) {
  const t = requestT(request);
  const headers = extensionCorsHeaders(request);
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const result = await exchangeDeviceCode(typeof body?.code === "string" ? body.code : "");
  if (!result) {
    return NextResponse.json({ error: t("api.invalidConnectionCode") }, { status: 401, headers });
  }
  return NextResponse.json(result, { headers });
}

export async function DELETE(request: Request) {
  const headers = extensionCorsHeaders(request);
  await revokeDeviceToken(request);
  return NextResponse.json({ ok: true }, { headers });
}
