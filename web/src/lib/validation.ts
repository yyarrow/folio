import type { Deletion, Note, SyncState } from "./types";

const MAX_CONTENT_LENGTH = 50_000;
const MAX_CONTEXT_LENGTH = 20_000;

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function optionalUrl(value: unknown): string | undefined {
  const candidate = optionalText(value, 8_000);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseNote(value: unknown): Note | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = optionalText(input.id, 100);
  const content = typeof input.content === "string"
    ? input.content.trim().slice(0, MAX_CONTENT_LENGTH)
    : "";
  const createdAt = optionalText(input.createdAt, 40);
  const updatedAt = optionalText(input.updatedAt, 40);
  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 30)
    : [];

  if (!id || !createdAt || !updatedAt) return null;
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) return null;

  const note: Note = {
    id,
    content,
    title: optionalText(input.title, 2_000),
    url: optionalUrl(input.url),
    selection: optionalText(input.selection, MAX_CONTEXT_LENGTH),
    tags,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  };
  return note.content || note.selection ? note : null;
}

export function parseDeletion(value: unknown): Deletion | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = optionalText(input.id, 100);
  const deletedAt = optionalText(input.deletedAt, 40);
  if (!id || !deletedAt || !Number.isFinite(Date.parse(deletedAt))) return null;
  return { id, deletedAt: new Date(deletedAt).toISOString() };
}

export function parseSyncState(value: unknown): SyncState | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.notes) || !Array.isArray(input.deletions)) return null;
  if (input.notes.length > 5_000 || input.deletions.length > 5_000) return null;

  const notes = input.notes.map(parseNote);
  const deletions = input.deletions.map(parseDeletion);
  if (notes.some((note) => !note) || deletions.some((deletion) => !deletion)) return null;
  return { notes: notes as Note[], deletions: deletions as Deletion[] };
}
