import "server-only";

import { database, ensureSchema, hasDatabase } from "./db";
import { mergeSyncState } from "./sync-state";
import type { Deletion, Note, SyncState } from "./types";

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

function assertProductionStorage(): void {
  if (process.env.NODE_ENV === "production" && !hasDatabase()) {
    throw new Error("DATABASE_URL is not configured");
  }
}

function localFile(userId: string): string {
  return `.data/notes-${userId.replace(/[^a-zA-Z0-9_-]/gu, "_")}.json`;
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

async function readLocal(userId: string): Promise<SyncState> {
  const { readFile } = await import("node:fs/promises");
  try {
    const value = JSON.parse(await readFile(localFile(userId), "utf8")) as Note[] | SyncState;
    return Array.isArray(value) ? { notes: value, deletions: [] } : value;
  } catch {
    return { notes: [], deletions: [] };
  }
}

async function writeLocal(userId: string, state: SyncState): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(".data", { recursive: true });
  await writeFile(localFile(userId), JSON.stringify(state, null, 2));
}

export async function listNotes(userId: string): Promise<Note[]> {
  assertProductionStorage();
  if (!hasDatabase()) {
    return (await readLocal(userId)).notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  await ensureSchema();
  const sql = await database();
  const rows = await sql`
    SELECT id, content, title, url, selection, tags, created_at, updated_at, deleted_at
    FROM folio_notes
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 500
  `;
  return (rows as NoteRow[]).map(rowToNote);
}

export async function upsertNote(userId: string, note: Note): Promise<void> {
  assertProductionStorage();
  if (!hasDatabase()) {
    await writeLocal(userId, mergeSyncState(await readLocal(userId), { notes: [note], deletions: [] }));
    return;
  }

  await ensureSchema();
  const sql = await database();
  const tags = JSON.stringify(note.tags);
  await sql`
    INSERT INTO folio_notes (
      id, user_id, content, title, url, selection, tags, created_at, updated_at
    )
    VALUES (
      ${note.id}, ${userId}, ${note.content}, ${note.title ?? null}, ${note.url ?? null},
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
    WHERE folio_notes.user_id = ${userId}
      AND folio_notes.updated_at <= EXCLUDED.updated_at
      AND (folio_notes.deleted_at IS NULL OR folio_notes.deleted_at < EXCLUDED.updated_at)
  `;
}

export async function deleteNote(userId: string, id: string, deletedAt = new Date().toISOString()): Promise<void> {
  assertProductionStorage();
  if (!hasDatabase()) {
    await writeLocal(userId, mergeSyncState(await readLocal(userId), {
      notes: [],
      deletions: [{ id, deletedAt }],
    }));
    return;
  }

  await ensureSchema();
  const sql = await database();
  await sql`
    INSERT INTO folio_notes (
      id, user_id, content, tags, created_at, updated_at, deleted_at
    )
    VALUES (${id}, ${userId}, '', '[]'::jsonb, ${deletedAt}, ${deletedAt}, ${deletedAt})
    ON CONFLICT (id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE folio_notes.user_id = ${userId}
      AND folio_notes.updated_at <= EXCLUDED.deleted_at
  `;
}

export async function syncNotes(userId: string, incoming: SyncState): Promise<SyncState> {
  assertProductionStorage();
  if (!hasDatabase()) {
    const state = mergeSyncState(await readLocal(userId), incoming);
    await writeLocal(userId, state);
    return state;
  }

  await ensureSchema();
  const sql = await database();
  if (incoming.notes.length || incoming.deletions.length) {
    await sql.transaction((transaction) => [
      ...incoming.notes.map((note) => {
        const tags = JSON.stringify(note.tags);
        return transaction`
          INSERT INTO folio_notes (
            id, user_id, content, title, url, selection, tags, created_at, updated_at, deleted_at
          )
          VALUES (
            ${note.id}, ${userId}, ${note.content}, ${note.title ?? null}, ${note.url ?? null},
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
          WHERE folio_notes.user_id = ${userId}
            AND folio_notes.updated_at <= EXCLUDED.updated_at
            AND (folio_notes.deleted_at IS NULL OR folio_notes.deleted_at < EXCLUDED.updated_at)
        `;
      }),
      ...incoming.deletions.map((deletion) => transaction`
        INSERT INTO folio_notes (
          id, user_id, content, tags, created_at, updated_at, deleted_at
        )
        VALUES (
          ${deletion.id}, ${userId}, '', '[]'::jsonb,
          ${deletion.deletedAt}, ${deletion.deletedAt}, ${deletion.deletedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
        WHERE folio_notes.user_id = ${userId}
          AND folio_notes.updated_at <= EXCLUDED.deleted_at
      `),
    ]);
  }

  const rows = await sql`
    SELECT id, content, title, url, selection, tags, created_at, updated_at, deleted_at
    FROM folio_notes
    WHERE user_id = ${userId}
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
