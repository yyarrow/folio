// Strings returned by API routes and used in emails. Keys are shared; every key must exist in both languages.
import { format, langFromRequest, type Lang } from "./i18n";

const zh = {
  "api.invalidOrigin": "请求来源无效。",
  "api.authNotConfigured": "Folio 登录尚未配置。",
  "api.invalidEmail": "请输入有效邮箱。",
  "api.rateLimited": "请求过于频繁，请稍后再试。",
  "api.waitlistFailed": "暂时无法提交申请，请稍后再试。",
  "api.storageNotConfigured": "云端存储尚未配置。",
  "api.invalidNote": "笔记内容无效。",
  "api.saveFailed": "暂时无法保存到云端。",
  "api.invalidSyncData": "同步数据无效。",
  "api.syncFailed": "暂时无法同步。",
  "api.invalidConfirmation": "确认信息无效。",
  "api.invalidNoteId": "笔记编号无效。",
  "api.deleteNoteFailed": "暂时无法删除笔记。",
  "api.invalidConnectionCode": "连接码无效或已过期。",
  "api.inviteOtherEmail": "这个邀请码对应的是另一个邮箱。",
  "api.inviteRequired": "首次使用需要有效邀请码。",
  "api.loginLinkSent": "登录链接已发送。",
  "api.loginEmailFailed": "暂时无法发送登录邮件，请稍后再试。",
  "api.notOnWaitlist": "该邮箱不在等候名单中。",
  "api.inviteFailed": "暂时无法发送邀请，请稍后再试。",
  "email.login.subject": "登录 Folio",
  "email.login.intro": "点击下面的链接登录 Folio：",
  "email.login.cta": "登录 Folio",
  "email.login.note": "链接将在 15 分钟后失效，且只能使用一次。如果不是你发起的请求，请忽略此邮件。",
  "email.invite.subject": "你的 Folio 邀请码",
  "email.invite.intro": "你的 Folio 邀请码是：",
  "email.invite.cta": "使用邀请码加入 Folio",
  "email.invite.note": "邀请码 30 天内有效，只能使用一次，并且必须配合当前邮箱地址（{email}）使用。如果不是你申请的，请忽略此邮件。",
} as const;

export type ServerKey = keyof typeof zh;

const en: Record<ServerKey, string> = {
  "api.invalidOrigin": "Invalid request origin.",
  "api.authNotConfigured": "Folio sign-in isn't configured yet.",
  "api.invalidEmail": "Enter a valid email address.",
  "api.rateLimited": "Too many requests. Please try again later.",
  "api.waitlistFailed": "Couldn't submit your request right now. Please try again later.",
  "api.storageNotConfigured": "Cloud storage isn't configured yet.",
  "api.invalidNote": "Invalid note.",
  "api.saveFailed": "Couldn't save to Folio Cloud right now.",
  "api.invalidSyncData": "Invalid sync data.",
  "api.syncFailed": "Couldn't sync right now.",
  "api.invalidConfirmation": "Invalid confirmation.",
  "api.invalidNoteId": "Invalid note ID.",
  "api.deleteNoteFailed": "Couldn't delete the note right now.",
  "api.invalidConnectionCode": "This connection code is invalid or has expired.",
  "api.inviteOtherEmail": "This invite code belongs to a different email address.",
  "api.inviteRequired": "A valid invite code is required for first-time sign-in.",
  "api.loginLinkSent": "Sign-in link sent.",
  "api.loginEmailFailed": "Couldn't send the sign-in email right now. Please try again later.",
  "api.notOnWaitlist": "This email isn't on the waitlist.",
  "api.inviteFailed": "Couldn't send the invite right now. Please try again later.",
  "email.login.subject": "Sign in to Folio",
  "email.login.intro": "Use the link below to sign in to Folio:",
  "email.login.cta": "Sign in to Folio",
  "email.login.note": "This link expires in 15 minutes and can be used only once. If you didn't request it, you can ignore this email.",
  "email.invite.subject": "Your Folio invite code",
  "email.invite.intro": "Your Folio invite code is:",
  "email.invite.cta": "Join Folio with this code",
  "email.invite.note": "This code is valid for 30 days, works once, and must be used with this email address ({email}). If you didn't request it, you can ignore this email.",
};

export const serverMessages: Record<Lang, Record<ServerKey, string>> = { zh, en };

export function serverT(lang: Lang, key: ServerKey, vars?: Record<string, string | number>): string {
  return format(serverMessages[lang][key], vars);
}

export function requestT(request: Request) {
  const lang = langFromRequest(request);
  return (key: ServerKey, vars?: Record<string, string | number>) => serverT(lang, key, vars);
}
