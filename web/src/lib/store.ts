import "server-only";

import type { Note } from "./types";

const LOCAL_FILE = ".data/notes.json";

type NoteRow = {
  id: string;
  content: string;
  title: string | null;
  url: string | null;
  selection: string | null;
  tags: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function usePostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function assertProductionStorage(): void {
  if (process.env.NODE_ENV === "production" && !usePostgres()) {
    throw new Error("DATABASE_URL is not configured");
  }
}

async function pgClient() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL!);
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const sql = await pgClient();
  await sql`
    CREATE TABLE IF NOT EXISTS folio_notes (
      id text PRIMARY KEY,
      content text NOT NULL DEFAULT '',
      title text,
      url text,
      selection text,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS folio_notes_updated_at_idx
    ON folio_notes (updated_at DESC)
  `;
  schemaReady = true;
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    content: row.content,
    title: row.title ?? undefined,
    url: row.url ?? undefined,
    selection: row.selection ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function readLocal(): Promise<Note[]> {
  const { readFile } = await import("node:fs/promises");
  try {
    return JSON.parse(await readFile(LOCAL_FILE, "utf8")) as Note[];
  } catch {
    return [];
  }
}

async function writeLocal(notes: Note[]): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(".data", { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(notes, null, 2));
}

export async function listNotes(): Promise<Note[]> {
  assertProductionStorage();
  if (!usePostgres()) {
    return (await readLocal()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  await ensureSchema();
  const sql = await pgClient();
  const rows = await sql`
    SELECT id, content, title, url, selection, tags, created_at, updated_at
    FROM folio_notes
    ORDER BY updated_at DESC
    LIMIT 500
  `;
  return (rows as NoteRow[]).map(rowToNote);
}

export async function upsertNote(note: Note): Promise<void> {
  assertProductionStorage();
  if (!usePostgres()) {
    const notes = await readLocal();
    const index = notes.findIndex((item) => item.id === note.id);
    if (index === -1) notes.push(note);
    else notes[index] = note;
    await writeLocal(notes);
    return;
  }

  await ensureSchema();
  const sql = await pgClient();
  const tags = JSON.stringify(note.tags);
  await sql`
    INSERT INTO folio_notes (
      id, content, title, url, selection, tags, created_at, updated_at
    )
    VALUES (
      ${note.id}, ${note.content}, ${note.title ?? null}, ${note.url ?? null},
      ${note.selection ?? null}, ${tags}::jsonb, ${note.createdAt}, ${note.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      content = EXCLUDED.content,
      title = EXCLUDED.title,
      url = EXCLUDED.url,
      selection = EXCLUDED.selection,
      tags = EXCLUDED.tags,
      updated_at = EXCLUDED.updated_at
    WHERE folio_notes.updated_at <= EXCLUDED.updated_at
  `;
}

export async function deleteNote(id: string): Promise<void> {
  assertProductionStorage();
  if (!usePostgres()) {
    await writeLocal((await readLocal()).filter((note) => note.id !== id));
    return;
  }

  await ensureSchema();
  const sql = await pgClient();
  await sql`DELETE FROM folio_notes WHERE id = ${id}`;
}
