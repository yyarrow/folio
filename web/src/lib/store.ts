import "server-only";

import { mergeSyncState } from "./sync-state";
import type { Deletion, Note, SyncState } from "./types";

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
  deleted_at: Date | string | null;
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
      updated_at timestamptz NOT NULL,
      deleted_at timestamptz
    )
  `;
  await sql`ALTER TABLE folio_notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
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

function rowToDeletion(row: NoteRow): Deletion | undefined {
  return row.deleted_at
    ? { id: row.id, deletedAt: new Date(row.deleted_at).toISOString() }
    : undefined;
}

async function readLocal(): Promise<SyncState> {
  const { readFile } = await import("node:fs/promises");
  try {
    const value = JSON.parse(await readFile(LOCAL_FILE, "utf8")) as Note[] | SyncState;
    return Array.isArray(value) ? { notes: value, deletions: [] } : value;
  } catch {
    return { notes: [], deletions: [] };
  }
}

async function writeLocal(state: SyncState): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(".data", { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(state, null, 2));
}

export async function listNotes(): Promise<Note[]> {
  assertProductionStorage();
  if (!usePostgres()) {
    return (await readLocal()).notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  await ensureSchema();
  const sql = await pgClient();
  const rows = await sql`
    SELECT id, content, title, url, selection, tags, created_at, updated_at, deleted_at
    FROM folio_notes
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 500
  `;
  return (rows as NoteRow[]).map(rowToNote);
}

export async function upsertNote(note: Note): Promise<void> {
  assertProductionStorage();
  if (!usePostgres()) {
    await writeLocal(mergeSyncState(await readLocal(), { notes: [note], deletions: [] }));
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
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL
    WHERE folio_notes.updated_at <= EXCLUDED.updated_at
      AND (folio_notes.deleted_at IS NULL OR folio_notes.deleted_at < EXCLUDED.updated_at)
  `;
}

export async function deleteNote(id: string, deletedAt = new Date().toISOString()): Promise<void> {
  assertProductionStorage();
  if (!usePostgres()) {
    await writeLocal(mergeSyncState(await readLocal(), {
      notes: [],
      deletions: [{ id, deletedAt }],
    }));
    return;
  }

  await ensureSchema();
  const sql = await pgClient();
  await sql`
    INSERT INTO folio_notes (
      id, content, tags, created_at, updated_at, deleted_at
    )
    VALUES (${id}, '', '[]'::jsonb, ${deletedAt}, ${deletedAt}, ${deletedAt})
    ON CONFLICT (id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE folio_notes.updated_at <= EXCLUDED.deleted_at
  `;
}

export async function syncNotes(incoming: SyncState): Promise<SyncState> {
  assertProductionStorage();
  if (!usePostgres()) {
    const state = mergeSyncState(await readLocal(), incoming);
    await writeLocal(state);
    return state;
  }

  await ensureSchema();
  const sql = await pgClient();
  if (incoming.notes.length || incoming.deletions.length) {
    await sql.transaction((transaction) => [
      ...incoming.notes.map((note) => {
        const tags = JSON.stringify(note.tags);
        return transaction`
          INSERT INTO folio_notes (
            id, content, title, url, selection, tags, created_at, updated_at, deleted_at
          )
          VALUES (
            ${note.id}, ${note.content}, ${note.title ?? null}, ${note.url ?? null},
            ${note.selection ?? null}, ${tags}::jsonb, ${note.createdAt}, ${note.updatedAt}, NULL
          )
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            title = EXCLUDED.title,
            url = EXCLUDED.url,
            selection = EXCLUDED.selection,
            tags = EXCLUDED.tags,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL
          WHERE folio_notes.updated_at <= EXCLUDED.updated_at
            AND (folio_notes.deleted_at IS NULL OR folio_notes.deleted_at < EXCLUDED.updated_at)
        `;
      }),
      ...incoming.deletions.map((deletion) => transaction`
        INSERT INTO folio_notes (
          id, content, tags, created_at, updated_at, deleted_at
        )
        VALUES (
          ${deletion.id}, '', '[]'::jsonb,
          ${deletion.deletedAt}, ${deletion.deletedAt}, ${deletion.deletedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
        WHERE folio_notes.updated_at <= EXCLUDED.deleted_at
      `),
    ]);
  }

  const rows = await sql`
    SELECT id, content, title, url, selection, tags, created_at, updated_at, deleted_at
    FROM folio_notes
    ORDER BY updated_at DESC
    LIMIT 10_000
  ` as NoteRow[];
  const notes: Note[] = [];
  const deletions: Deletion[] = [];
  for (const row of rows) {
    const deletion = rowToDeletion(row);
    if (deletion) deletions.push(deletion);
    else notes.push(rowToNote(row));
  }
  return { notes, deletions };
}
