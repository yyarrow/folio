import type { Note } from "./types";

const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  for (const match of content.matchAll(TAG_PATTERN)) {
    const tag = match[1]?.trim().toLocaleLowerCase();
    if (tag) tags.add(tag);
  }
  return [...tags];
}

export function matchesSearch(note: Note, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;

  return [note.content, note.title, note.url, note.selection, note.tags.join(" ")]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase().includes(query));
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function displayDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(undefined, {
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
