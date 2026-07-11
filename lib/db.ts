import { openDB, type DBSchema } from "idb";
import type { Note } from "./types";
import { sortNotes } from "./notes";

interface FolioDatabase extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { "by-updated-at": string };
  };
}

const database = openDB<FolioDatabase>("folio", 1, {
  upgrade(db) {
    const store = db.createObjectStore("notes", { keyPath: "id" });
    store.createIndex("by-updated-at", "updatedAt");
  },
});

export async function listNotes(): Promise<Note[]> {
  return sortNotes(await (await database).getAll("notes"));
}

export async function saveNote(note: Note): Promise<void> {
  await (await database).put("notes", note);
}

export async function removeNote(id: string): Promise<void> {
  await (await database).delete("notes", id);
}
