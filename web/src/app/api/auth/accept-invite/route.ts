import { NextResponse } from "next/server";
import { acceptEmailInvite, checkRateLimit, createSession, isAuthConfigured } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isAuthConfigured()) return NextResponse.redirect(new URL("/?auth=invite-invalid", url));

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!await checkRateLimit("accept-invite-ip", forwarded, 20, 60 * 60)) {
    return NextResponse.redirect(new URL("/?auth=invite-invalid", url));
  }

  try {
    const result = await acceptEmailInvite(url.searchParams.get("code") ?? "");
    if (result.status === "ok") {
      await createSession(result.userId);
      return NextResponse.redirect(new URL("/?auth=success", url));
    }
    return NextResponse.redirect(new URL(result.status === "existing" ? "/?auth=existing" : "/?auth=invite-invalid", url));
  } catch (error) {
    console.error("accept invite failed", error);
    return NextResponse.redirect(new URL("/?auth=invite-invalid", url));
  }
}
