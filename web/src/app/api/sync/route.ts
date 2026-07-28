import { NextResponse } from "next/server";
import { isRequestAuthenticated } from "@/lib/auth";
import { syncNotes } from "@/lib/store";
import { parseSyncState } from "@/lib/validation";

function responseHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && (
    origin === "https://folio.warmbeing.com"
    || origin.startsWith("chrome-extension://")
    || origin.startsWith("moz-extension://")
    || origin.startsWith("http://localhost:")
  ) ? origin : undefined;

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: responseHeaders(request) });
}

export async function POST(request: Request) {
  const headers = responseHeaders(request);
  if (!await isRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const state = parseSyncState(await request.json().catch(() => null));
  if (!state) {
    return NextResponse.json({ error: "同步数据无效。" }, { status: 400, headers });
  }

  try {
    return NextResponse.json(await syncNotes(state), { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "暂时无法同步。" }, { status: 503, headers });
  }
}
