import { NextResponse } from "next/server";
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
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Folio 登录尚未配置。" }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { email?: unknown; inviteCode?: unknown } | null;
  const email = normalizeEmail(body?.email);
  const candidateInvite = typeof body?.inviteCode === "string" ? body.inviteCode : "";
  if (!isEmail(email)) {
    return NextResponse.json({ error: "请输入有效邮箱。" }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [allowedByIp, allowedByEmail] = await Promise.all([
    checkRateLimit("email-link-ip", forwarded, 20, 60 * 60),
    checkRateLimit("email-link-email", email, 5, 60 * 60),
  ]);
  if (!allowedByIp || !allowedByEmail) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试。" }, { status: 429 });
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
          return NextResponse.json({ error: "这个邀请码对应的是另一个邮箱。" }, { status: 403 });
        }
        const inviteId = check === "valid" ? await claimOneTimeInvite(candidateInvite, email) : null;
        if (!inviteId) {
          return NextResponse.json({ error: "首次使用需要有效邀请码。" }, { status: 403 });
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
    const previewUrl = await sendLoginEmail(email, await issueLoginToken(user.id));
    return NextResponse.json({ ok: true, message: "登录链接已发送。", previewUrl });
  } catch (error) {
    console.error("email login failed", error);
    return NextResponse.json({ error: "暂时无法发送登录邮件，请稍后再试。" }, { status: 503 });
  }
}
