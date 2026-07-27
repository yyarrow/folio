import type { PageContext, SharedContext } from "./types";

const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/iu;

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  for (const match of content.matchAll(TAG_PATTERN)) {
    const tag = match[1]?.trim().toLocaleLowerCase();
    if (tag) tags.add(tag);
  }
  return [...tags];
}

export function normalizeSharedContext(shared: SharedContext): PageContext {
  const rawText = shared.text?.trim() ?? "";
  const matchedUrl = rawText.match(URL_PATTERN)?.[0]?.replace(/[),.;，。；]+$/u, "");
  const candidateUrl = shared.url?.trim() || matchedUrl;
  let url: string | undefined;
  try {
    const parsed = new URL(candidateUrl ?? "");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.toString();
  } catch {
    url = undefined;
  }
  const selection = rawText
    .replace(matchedUrl ?? "", "")
    .trim()
    .replace(/^[—–·\s]+|[—–·\s]+$/gu, "");

  return {
    title: shared.title?.trim() || undefined,
    url,
    selection: selection || undefined,
  };
}

export function displayDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatNoteDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("zh-CN", {
    ...(sameDay ? {} : { month: "numeric", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
