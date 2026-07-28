import { openDB, type DBSchema } from "idb";
import type { Deletion, Note, SyncState } from "./types";
import { sortNotes } from "./notes";

interface FolioDatabase extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { "by-updated-at": string };
  };
  deletions: {
    key: string;
    value: Deletion;
  };
}

const database = openDB<FolioDatabase>("folio", 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("notes")) {
      const store = db.createObjectStore("notes", { keyPath: "id" });
      store.createIndex("by-updated-at", "updatedAt");
    }
    if (!db.objectStoreNames.contains("deletions")) {
      db.createObjectStore("deletions", { keyPath: "id" });
    }
  },
});

export async function listNotes(): Promise<Note[]> {
  return sortNotes(await (await database).getAll("notes"));
}

export async function saveNote(note: Note): Promise<void> {
  const db = await database;
  const transaction = db.transaction(["notes", "deletions"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").put(note),
    transaction.objectStore("deletions").delete(note.id),
    transaction.done,
  ]);
}

export async function removeNote(id: string): Promise<void> {
  const db = await database;
  const transaction = db.transaction(["notes", "deletions"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").delete(id),
    transaction.objectStore("deletions").put({ id, deletedAt: new Date().toISOString() }),
    transaction.done,
  ]);
}

export async function getSyncState(): Promise<SyncState> {
  const db = await database;
  const [notes, deletions] = await Promise.all([
    db.getAll("notes"),
    db.getAll("deletions"),
  ]);
  return { notes, deletions };
}

export async function applySyncState(state: SyncState): Promise<void> {
  const db = await database;
  const transaction = db.transaction(["notes", "deletions"], "readwrite");
  await Promise.all([
    transaction.objectStore("notes").clear(),
    transaction.objectStore("deletions").clear(),
    ...state.notes.map((note) => transaction.objectStore("notes").put(note)),
    ...state.deletions.map((deletion) => transaction.objectStore("deletions").put(deletion)),
    transaction.done,
  ]);
}
