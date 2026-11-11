import { NextResponse } from "next/server";
import { requestT } from "@/lib/server-messages";
import { deleteAccount, getCurrentUser, isSameOrigin } from "@/lib/auth";

export async function DELETE(request: Request) {
  const t = requestT(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: t("api.invalidOrigin") }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE") {
    return NextResponse.json({ error: t("api.invalidConfirmation") }, { status: 400 });
  }
  await deleteAccount(user.id);
  return NextResponse.json({ ok: true });
}
