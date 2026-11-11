import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/newsreader/opsz.css";
import "./tokens.css";
import "./globals.css";
import { I18nProvider } from "./i18n-provider";
import { LANG_COOKIE, htmlLang, pickLang, type Lang } from "@/lib/i18n";

const DESCRIPTIONS: Record<Lang, string> = {
  zh: "一个随时打开、随处记录的轻量笔记工具。",
  en: "A light notebook you can open anywhere to capture what you are reading and thinking.",
};

async function requestLang(): Promise<Lang> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  return pickLang(headerList.get("accept-language"), cookieStore.get(LANG_COOKIE)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await requestLang();
  return {
  title: "Folio",
  description: DESCRIPTIONS[lang],
  applicationName: "Folio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Folio",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e7" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1915" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await requestLang();
  return (
    <html lang={htmlLang(lang)}>
      <body>
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
