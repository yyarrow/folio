"use client";

import { openDB, type DBSchema } from "idb";
import type { Note, SharedContext } from "./types";

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
  meta: {
    key: string;
    value: unknown;
  };
}

function createDatabase() {
  return openDB<FolioMobileDatabase>("folio-mobile", 1, {
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
  const transaction = db.transaction(["notes", "outbox"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").put(note),
    transaction.objectStore("outbox").put(note),
    transaction.done,
  ]);
}

export async function listPendingNotes(): Promise<Note[]> {
  return (await getDatabase()).getAll("outbox");
}

export async function markNoteSynced(id: string): Promise<void> {
  await (await getDatabase()).delete("outbox", id);
}

export async function replaceCachedNotes(remoteNotes: Note[]): Promise<Note[]> {
  const db = await getDatabase();
  const pending = await db.getAll("outbox");
  const merged = new Map(remoteNotes.map((note) => [note.id, note]));
  for (const note of pending) {
    const remote = merged.get(note.id);
    if (!remote || note.updatedAt > remote.updatedAt) merged.set(note.id, note);
  }

  const transaction = db.transaction("notes", "readwrite");
  await transaction.store.clear();
  for (const note of merged.values()) await transaction.store.put(note);
  await transaction.done;
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function removeLocalNote(id: string): Promise<void> {
  const db = await getDatabase();
  const transaction = db.transaction(["notes", "outbox"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").delete(id),
    transaction.objectStore("outbox").delete(id),
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
  const transaction = db.transaction(["notes", "outbox", "meta"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").clear(),
    transaction.objectStore("outbox").clear(),
    transaction.objectStore("meta").clear(),
    transaction.done,
  ]);
}
