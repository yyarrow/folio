export type Lang = "zh" | "en";

export const LANG_COOKIE = "folio_lang";

export function isLang(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}

/** An explicit cookie choice wins; otherwise any Chinese preference in Accept-Language picks zh. */
export function pickLang(acceptLanguage?: string | null, cookieValue?: string | null): Lang {
  if (isLang(cookieValue)) return cookieValue;
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { tag: tag!.toLowerCase(), q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q)[0];
  if (!preferred) return "zh";
  return preferred.tag.startsWith("zh") ? "zh" : "en";
}

export function htmlLang(lang: Lang): string {
  return lang === "zh" ? "zh-CN" : "en";
}

/** Replace {name} placeholders. */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function langFromRequest(request: Request): Lang {
  const cookie = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LANG_COOKIE)?.[1];
  return pickLang(request.headers.get("accept-language"), cookie);
}
