import "server-only";

import type { Transporter } from "nodemailer";

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

export async function sendLoginEmail(email: string, token: string): Promise<string | undefined> {
  const url = `${appUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await deliver(
    email,
    "登录 Folio",
    `<p>点击下面的链接登录 Folio：</p><p><a href="${url}">登录 Folio</a></p><p>链接将在 15 分钟后失效，且只能使用一次。如果不是你发起的请求，请忽略此邮件。</p>`,
  );
  return process.env.NODE_ENV === "production" ? undefined : url;
}
