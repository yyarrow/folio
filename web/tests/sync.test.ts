import { describe, expect, test } from "bun:test";
import { mergeSyncState } from "../src/lib/sync-state";
import { parseSyncState } from "../src/lib/validation";
import type { Note } from "../src/lib/types";

function note(id: string, updatedAt: string, content = id): Note {
  return {
    id,
    content,
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt,
  };
}

describe("sync state", () => {
  test("keeps the newest note across devices", () => {
    const result = mergeSyncState(
      { notes: [note("one", "2026-07-01T01:00:00.000Z", "old")], deletions: [] },
      { notes: [note("one", "2026-07-01T02:00:00.000Z", "new")], deletions: [] },
    );
    expect(result.notes[0]?.content).toBe("new");
  });

  test("lets deletion win a timestamp tie", () => {
    const timestamp = "2026-07-01T02:00:00.000Z";
    const result = mergeSyncState(
      { notes: [note("one", timestamp)], deletions: [] },
      { notes: [], deletions: [{ id: "one", deletedAt: timestamp }] },
    );
    expect(result.notes).toHaveLength(0);
    expect(result.deletions).toEqual([{ id: "one", deletedAt: timestamp }]);
  });

  test("allows a newer edit to restore a deleted note", () => {
    const result = mergeSyncState(
      { notes: [], deletions: [{ id: "one", deletedAt: "2026-07-01T02:00:00.000Z" }] },
      { notes: [note("one", "2026-07-01T03:00:00.000Z")], deletions: [] },
    );
    expect(result.notes).toHaveLength(1);
    expect(result.deletions).toHaveLength(0);
  });

  test("rejects malformed sync payloads", () => {
    expect(parseSyncState({ notes: [{}], deletions: [] })).toBeNull();
  });
});
