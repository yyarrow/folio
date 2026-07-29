import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { openDB } from "idb";
import {
  LOCAL_SCOPE,
  clearLocalData,
  listLocalNotes,
  mergeLocalNotesIntoUser,
  queueNote,
  scopeForUser,
} from "../src/lib/client-db";
import type { Note } from "../src/lib/types";

function note(id: string, content: string, updatedAt: string): Note {
  return {
    id,
    content,
    tags: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("local workspace storage", () => {
  test("keeps a v2 account cache in place and only clears guest notes after an explicit merge", async () => {
    const userId = "existing-user";
    const userScope = scopeForUser(userId);
    const existing = note("cloud-note", "existing cloud cache", "2026-07-01T00:00:00.000Z");
    const legacy = await openDB("folio-mobile", 2, {
      upgrade(db) {
        const notes = db.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("by-updated-at", "updatedAt");
        db.createObjectStore("outbox", { keyPath: "id" });
        db.createObjectStore("deletions", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
    await legacy.put("notes", existing);
    await legacy.put("meta", userId, "user-id");
    legacy.close();

    expect(await listLocalNotes(userScope)).toEqual([existing]);
    expect(await listLocalNotes(LOCAL_SCOPE)).toEqual([]);
    const compatible = await openDB("folio-mobile");
    expect(compatible.version).toBe(2);
    compatible.close();

    const local = note("local-note", "guest thought", "2026-07-02T00:00:00.000Z");
    await queueNote(LOCAL_SCOPE, local);
    await mergeLocalNotesIntoUser(userId);

    expect((await listLocalNotes(userScope)).map((item) => item.id)).toEqual(["local-note", "cloud-note"]);
    expect(await listLocalNotes(LOCAL_SCOPE)).toEqual([local]);

    await clearLocalData(LOCAL_SCOPE);
    expect(await listLocalNotes(LOCAL_SCOPE)).toEqual([]);
    expect((await listLocalNotes(userScope)).map((item) => item.id)).toEqual(["local-note", "cloud-note"]);
  });
});
