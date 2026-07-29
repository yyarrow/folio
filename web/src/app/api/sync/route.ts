import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { extensionCorsHeaders } from "@/lib/cors";
import { syncNotes } from "@/lib/store";
import { parseSyncState } from "@/lib/validation";

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: extensionCorsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = extensionCorsHeaders(request);
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const state = parseSyncState(await request.json().catch(() => null));
  if (!state) {
    return NextResponse.json({ error: "同步数据无效。" }, { status: 400, headers });
  }

  try {
    return NextResponse.json(await syncNotes(user.id, state), { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "暂时无法同步。" }, { status: 503, headers });
  }
}
