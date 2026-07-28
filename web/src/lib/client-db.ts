"use client";

import { openDB, type DBSchema } from "idb";
import type { Deletion, Note, SharedContext, SyncState } from "./types";

interface FolioMobileDatabase extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { "by-updated-at": string };
  };
  outbox: {
    key: string;
    value: Note;
  };
  deletions: {
    key: string;
    value: Deletion;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

function createDatabase() {
  return openDB<FolioMobileDatabase>("folio-mobile", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("notes")) {
        const notes = db.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("by-updated-at", "updatedAt");
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("deletions")) {
        db.createObjectStore("deletions", { keyPath: "id" });
      }
    },
  });
}

let database: ReturnType<typeof createDatabase> | undefined;

function getDatabase() {
  database ??= createDatabase();
  return database;
}

export async function listLocalNotes(): Promise<Note[]> {
  const notes = await (await getDatabase()).getAll("notes");
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function queueNote(note: Note): Promise<void> {
  const db = await getDatabase();
  const transaction = db.transaction(["notes", "outbox", "deletions"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").put(note),
    transaction.objectStore("outbox").put(note),
    transaction.objectStore("deletions").delete(note.id),
    transaction.done,
  ]);
}

export async function getLocalSyncState(): Promise<SyncState> {
  const db = await getDatabase();
  const [notes, deletions] = await Promise.all([
    db.getAll("notes"),
    db.getAll("deletions"),
  ]);
  return { notes, deletions };
}

export async function applySyncState(state: SyncState): Promise<Note[]> {
  const db = await getDatabase();
  const transaction = db.transaction(["notes", "outbox", "deletions"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").clear(),
    transaction.objectStore("outbox").clear(),
    transaction.objectStore("deletions").clear(),
    ...state.notes.map((note) => transaction.objectStore("notes").put(note)),
    ...state.deletions.map((deletion) => transaction.objectStore("deletions").put(deletion)),
    transaction.done,
  ]);
  return [...state.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function queueDeletion(id: string): Promise<void> {
  const db = await getDatabase();
  const transaction = db.transaction(["notes", "outbox", "deletions"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").delete(id),
    transaction.objectStore("outbox").delete(id),
    transaction.objectStore("deletions").put({ id, deletedAt: new Date().toISOString() }),
    transaction.done,
  ]);
}

export async function consumeSharedContext(): Promise<SharedContext | undefined> {
  const db = await getDatabase();
  const shared = await db.get("meta", "shared-context") as SharedContext | undefined;
  if (shared) await db.delete("meta", "shared-context");
  return shared;
}

export async function clearLocalData(): Promise<void> {
  const db = await getDatabase();
  const transaction = db.transaction(["notes", "outbox", "deletions", "meta"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").clear(),
    transaction.objectStore("outbox").clear(),
    transaction.objectStore("deletions").clear(),
    transaction.objectStore("meta").clear(),
    transaction.done,
  ]);
}
