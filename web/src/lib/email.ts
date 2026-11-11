import "server-only";

import type { Transporter } from "nodemailer";
import type { Lang } from "./i18n";
import { serverT } from "./server-messages";

function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/u, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function assertEmailConfigured(): void {
  if (process.env.NODE_ENV === "production" && (!process.env.EMAIL_FROM || !process.env.SMTP_HOST)) {
    throw new Error("Email delivery is not configured");
  }
}

let transporter: Transporter | null = null;

async function deliver(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.EMAIL_FROM || !process.env.SMTP_HOST) {
    console.info(`[Folio email preview] ${subject} → ${to}\n${html.replace(/<[^>]+>/gu, " ")}`);
    return;
  }
  if (!transporter) {
    const { createTransport } = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
}

export async function sendLoginEmail(email: string, token: string, lang: Lang): Promise<string | undefined> {
  const url = `${appUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await deliver(
    email,
    serverT(lang, "email.login.subject"),
    `<p>${serverT(lang, "email.login.intro")}</p><p><a href="${url}">${serverT(lang, "email.login.cta")}</a></p><p>${serverT(lang, "email.login.note")}</p>`,
  );
  return process.env.NODE_ENV === "production" ? undefined : url;
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

export async function sendInviteEmail(email: string, code: string, lang: Lang): Promise<string | undefined> {
  const url = `${appUrl()}/?invite=${encodeURIComponent(code)}`;
  await deliver(
    email,
    serverT(lang, "email.invite.subject"),
    `<p>${serverT(lang, "email.invite.intro")}</p><p style="font-size:24px;font-weight:600;letter-spacing:2px;font-family:monospace">${escapeHtml(code)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none">${serverT(lang, "email.invite.cta")}</a></p><p>${escapeHtml(serverT(lang, "email.invite.note", { email }))}</p>`,
  );
  return process.env.NODE_ENV === "production" ? undefined : url;
}
