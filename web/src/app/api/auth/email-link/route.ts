import { NextResponse } from "next/server";
import { langFromRequest } from "@/lib/i18n";
import { requestT } from "@/lib/server-messages";
import {
  checkRateLimit,
  checkOneTimeInvite,
  claimOneTimeInvite,
  createUser,
  findUserByEmail,
  recordInviteUser,
  releaseInvite,
  isAuthConfigured,
  isEmail,
  isSameOrigin,
  issueLoginToken,
  normalizeEmail,
  verifyInviteCode,
} from "@/lib/auth";
import { assertEmailConfigured, sendLoginEmail } from "@/lib/email";

export async function POST(request: Request) {
  const t = requestT(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: t("api.invalidOrigin") }, { status: 403 });
  }
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: t("api.authNotConfigured") }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { email?: unknown; inviteCode?: unknown } | null;
  const email = normalizeEmail(body?.email);
  const candidateInvite = typeof body?.inviteCode === "string" ? body.inviteCode : "";
  if (!isEmail(email)) {
    return NextResponse.json({ error: t("api.invalidEmail") }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [allowedByIp, allowedByEmail] = await Promise.all([
    checkRateLimit("email-link-ip", forwarded, 20, 60 * 60),
    checkRateLimit("email-link-email", email, 5, 60 * 60),
  ]);
  if (!allowedByIp || !allowedByEmail) {
    return NextResponse.json({ error: t("api.rateLimited") }, { status: 429 });
  }

  try {
    assertEmailConfigured();
    let user = await findUserByEmail(email);
    if (!user) {
      if (verifyInviteCode(candidateInvite)) {
        user = await createUser(email);
      } else {
        const check = await checkOneTimeInvite(candidateInvite, email);
        if (check === "other-email") {
          return NextResponse.json({ error: t("api.inviteOtherEmail") }, { status: 403 });
        }
        const inviteId = check === "valid" ? await claimOneTimeInvite(candidateInvite, email) : null;
        if (!inviteId) {
          return NextResponse.json({ error: t("api.inviteRequired") }, { status: 403 });
        }
        try {
          user = await createUser(email);
        } catch (error) {
          await releaseInvite(inviteId).catch(() => undefined);
          throw error;
        }
        await recordInviteUser(inviteId, user.id);
      }
    }
    const previewUrl = await sendLoginEmail(email, await issueLoginToken(user.id), langFromRequest(request));
    return NextResponse.json({ ok: true, message: t("api.loginLinkSent"), previewUrl });
  } catch (error) {
    console.error("email login failed", error);
    return NextResponse.json({ error: t("api.loginEmailFailed") }, { status: 503 });
  }
}
