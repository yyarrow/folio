// Strings returned by API routes and used in emails. Keys are shared; every key must exist in both languages.
import { format, langFromRequest, type Lang } from "./i18n";

const zh = {
  placeholder: "",
} as const;

export type ServerKey = keyof typeof zh;

const en: Record<ServerKey, string> = {
  placeholder: "",
};

export const serverMessages: Record<Lang, Record<ServerKey, string>> = { zh, en };

export function serverT(lang: Lang, key: ServerKey, vars?: Record<string, string | number>): string {
  return format(serverMessages[lang][key], vars);
}

export function requestT(request: Request) {
  const lang = langFromRequest(request);
  return (key: ServerKey, vars?: Record<string, string | number>) => serverT(lang, key, vars);
}
