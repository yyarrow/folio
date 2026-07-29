import { NextResponse } from "next/server";
import { deleteAccount, getCurrentUser, isSameOrigin } from "@/lib/auth";

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE") {
    return NextResponse.json({ error: "确认信息无效。" }, { status: 400 });
  }
  await deleteAccount(user.id);
  return NextResponse.json({ ok: true });
}
