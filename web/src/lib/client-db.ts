"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { mergeSyncState } from "./sync-state";
import type { Deletion, Note, SharedContext, SyncState } from "./types";

export const LOCAL_SCOPE = "local";
const DATABASE_NAME = "folio-mobile";
const DATABASE_VERSION = 3;
const MIGRATION_KEY = "scoped-storage-v3";

interface ScopedNote {
  storageKey: string;
  scope: string;
  note: Note;
}

interface ScopedDeletion {
  storageKey: string;
  scope: string;
  deletion: Deletion;
}

export interface CachedWorkspace {
  scope: string;
  user?: { id: string; email: string };
}

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
  "scoped-notes": {
    key: string;
    value: ScopedNote;
    indexes: { "by-scope": string };
  };
  "scoped-outbox": {
    key: string;
    value: ScopedNote;
    indexes: { "by-scope": string };
  };
  "scoped-deletions": {
    key: string;
    value: ScopedDeletion;
    indexes: { "by-scope": string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

function userScope(userId: string): string {
  return `user:${userId}`;
}

function storageKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}

function createDatabase() {
  return openDB<FolioMobileDatabase>(DATABASE_NAME, DATABASE_VERSION, {
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
      if (!db.objectStoreNames.contains("scoped-notes")) {
        const notes = db.createObjectStore("scoped-notes", { keyPath: "storageKey" });
        notes.createIndex("by-scope", "scope");
      }
      if (!db.objectStoreNames.contains("scoped-outbox")) {
        const outbox = db.createObjectStore("scoped-outbox", { keyPath: "storageKey" });
        outbox.createIndex("by-scope", "scope");
      }
      if (!db.objectStoreNames.contains("scoped-deletions")) {
        const deletions = db.createObjectStore("scoped-deletions", { keyPath: "storageKey" });
        deletions.createIndex("by-scope", "scope");
      }
    },
  });
}

let database: ReturnType<typeof createDatabase> | undefined;
let migration: Promise<void> | undefined;

function getDatabase() {
  database ??= createDatabase();
  return database;
}

async function migrateLegacyStorage(db: IDBPDatabase<FolioMobileDatabase>): Promise<void> {
  if (await db.get("meta", MIGRATION_KEY)) return;

  const transaction = db.transaction([
    "notes",
    "outbox",
    "deletions",
    "scoped-notes",
    "scoped-outbox",
    "scoped-deletions",
    "meta",
  ], "readwrite");
  const meta = transaction.objectStore("meta");
  const [notes, outbox, deletions, legacyUserId] = await Promise.all([
    transaction.objectStore("notes").getAll(),
    transaction.objectStore("outbox").getAll(),
    transaction.objectStore("deletions").getAll(),
    meta.get("user-id") as Promise<string | undefined>,
  ]);
  const scope = legacyUserId ? userScope(legacyUserId) : LOCAL_SCOPE;

  await Promise.all([
    ...notes.map((note) => transaction.objectStore("scoped-notes").put({
      storageKey: storageKey(scope, note.id), scope, note,
    })),
    ...outbox.map((note) => transaction.objectStore("scoped-outbox").put({
      storageKey: storageKey(scope, note.id), scope, note,
    })),
    ...deletions.map((deletion) => transaction.objectStore("scoped-deletions").put({
      storageKey: storageKey(scope, deletion.id), scope, deletion,
    })),
    transaction.objectStore("notes").clear(),
    transaction.objectStore("outbox").clear(),
    transaction.objectStore("deletions").clear(),
    meta.put(scope, "last-scope"),
    meta.put(true, MIGRATION_KEY),
  ]);
  await transaction.done;
}

async function readyDatabase(): Promise<IDBPDatabase<FolioMobileDatabase>> {
  const db = await getDatabase();
  migration ??= migrateLegacyStorage(db);
  await migration;
  return db;
}

async function readScope(scope: string): Promise<SyncState> {
  const db = await readyDatabase();
  const [notes, deletions] = await Promise.all([
    db.getAllFromIndex("scoped-notes", "by-scope", scope),
    db.getAllFromIndex("scoped-deletions", "by-scope", scope),
  ]);
  return {
    notes: notes.map((record) => record.note),
    deletions: deletions.map((record) => record.deletion),
  };
}

export function scopeForUser(userId: string): string {
  return userScope(userId);
}

export async function getCachedWorkspace(): Promise<CachedWorkspace> {
  const db = await readyDatabase();
  const storedScope = await db.get("meta", "last-scope");
  const user = await db.get("meta", "last-user");
  const scope = typeof storedScope === "string" ? storedScope : LOCAL_SCOPE;
  return {
    scope,
    user: scope !== LOCAL_SCOPE && user && typeof user === "object" && "id" in user && "email" in user
      ? user as CachedWorkspace["user"]
      : undefined,
  };
}

export async function rememberLocalWorkspace(): Promise<void> {
  const db = await readyDatabase();
  await db.put("meta", LOCAL_SCOPE, "last-scope");
}

export async function rememberUserWorkspace(user: { id: string; email: string }): Promise<string> {
  const db = await readyDatabase();
  const scope = userScope(user.id);
  const transaction = db.transaction("meta", "readwrite");
  await Promise.all([
    transaction.store.put(scope, "last-scope"),
    transaction.store.put(user, "last-user"),
    transaction.done,
  ]);
  return scope;
}

export async function listLocalNotes(scope = LOCAL_SCOPE): Promise<Note[]> {
  const state = await readScope(scope);
  return state.notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function countLocalNotes(): Promise<number> {
  return (await readScope(LOCAL_SCOPE)).notes.length;
}

export async function queueNote(scope: string, note: Note): Promise<void> {
  const db = await readyDatabase();
  const transaction = db.transaction(["scoped-notes", "scoped-outbox", "scoped-deletions"], "readwrite");
  const record = { storageKey: storageKey(scope, note.id), scope, note };
  await Promise.all([
    transaction.objectStore("scoped-notes").put(record),
    transaction.objectStore("scoped-outbox").put(record),
    transaction.objectStore("scoped-deletions").delete(record.storageKey),
    transaction.done,
  ]);
}

export async function getLocalSyncState(scope: string): Promise<SyncState> {
  return readScope(scope);
}

export async function applySyncState(scope: string, state: SyncState): Promise<Note[]> {
  const db = await readyDatabase();
  const currentNotes = await db.getAllKeysFromIndex("scoped-notes", "by-scope", scope);
  const currentOutbox = await db.getAllKeysFromIndex("scoped-outbox", "by-scope", scope);
  const currentDeletions = await db.getAllKeysFromIndex("scoped-deletions", "by-scope", scope);
  const transaction = db.transaction(["scoped-notes", "scoped-outbox", "scoped-deletions"], "readwrite");
  await Promise.all([
    ...currentNotes.map((key) => transaction.objectStore("scoped-notes").delete(key)),
    ...currentOutbox.map((key) => transaction.objectStore("scoped-outbox").delete(key)),
    ...currentDeletions.map((key) => transaction.objectStore("scoped-deletions").delete(key)),
    ...state.notes.map((note) => transaction.objectStore("scoped-notes").put({
      storageKey: storageKey(scope, note.id), scope, note,
    })),
    ...state.deletions.map((deletion) => transaction.objectStore("scoped-deletions").put({
      storageKey: storageKey(scope, deletion.id), scope, deletion,
    })),
    transaction.done,
  ]);
  return [...state.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function queueDeletion(scope: string, id: string): Promise<void> {
  const db = await readyDatabase();
  const transaction = db.transaction(["scoped-notes", "scoped-outbox", "scoped-deletions"], "readwrite");
  const key = storageKey(scope, id);
  const deletion = { id, deletedAt: new Date().toISOString() };
  await Promise.all([
    transaction.objectStore("scoped-notes").delete(key),
    transaction.objectStore("scoped-outbox").delete(key),
    transaction.objectStore("scoped-deletions").put({ storageKey: key, scope, deletion }),
    transaction.done,
  ]);
}

export async function mergeLocalNotesIntoUser(userId: string): Promise<{ scope: string; count: number }> {
  const scope = userScope(userId);
  const local = await readScope(LOCAL_SCOPE);
  const user = await readScope(scope);
  await applySyncState(scope, mergeSyncState(user, local));
  return { scope, count: local.notes.length };
}

export async function consumeSharedContext(): Promise<SharedContext | undefined> {
  const db = await readyDatabase();
  const shared = await db.get("meta", "shared-context") as SharedContext | undefined;
  if (shared) await db.delete("meta", "shared-context");
  return shared;
}

export async function clearLocalData(scope: string): Promise<void> {
  const state = await readScope(scope);
  const db = await readyDatabase();
  const transaction = db.transaction(["scoped-notes", "scoped-outbox", "scoped-deletions"], "readwrite");
  await Promise.all([
    ...state.notes.map((note) => transaction.objectStore("scoped-notes").delete(storageKey(scope, note.id))),
    ...state.deletions.map((deletion) => transaction.objectStore("scoped-deletions").delete(storageKey(scope, deletion.id))),
    ...state.notes.map((note) => transaction.objectStore("scoped-outbox").delete(storageKey(scope, note.id))),
    transaction.done,
  ]);
}
