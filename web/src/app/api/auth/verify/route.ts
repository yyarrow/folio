import { NextResponse } from "next/server";
import { consumeLoginToken, createSession } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await consumeLoginToken(url.searchParams.get("token") ?? "");
  if (!userId) {
    return NextResponse.redirect(new URL("/?auth=expired", url));
  }
  await createSession(userId);
  return NextResponse.redirect(new URL("/?auth=success", url));
}
