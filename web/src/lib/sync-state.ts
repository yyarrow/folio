import type { Deletion, Note, SyncState } from "./types";

type SyncRecord =
  | { kind: "note"; value: Note; timestamp: string }
  | { kind: "deletion"; value: Deletion; timestamp: string };

export function mergeSyncState(...states: SyncState[]): SyncState {
  const records = new Map<string, SyncRecord>();

  for (const state of states) {
    for (const note of state.notes) {
      const current = records.get(note.id);
      if (!current || note.updatedAt > current.timestamp) {
        records.set(note.id, { kind: "note", value: note, timestamp: note.updatedAt });
      }
    }
    for (const deletion of state.deletions) {
      const current = records.get(deletion.id);
      if (!current || deletion.deletedAt >= current.timestamp) {
        records.set(deletion.id, {
          kind: "deletion",
          value: deletion,
          timestamp: deletion.deletedAt,
        });
      }
    }
  }

  const notes: Note[] = [];
  const deletions: Deletion[] = [];
  for (const record of records.values()) {
    if (record.kind === "note") notes.push(record.value);
    else deletions.push(record.value);
  }
  notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  deletions.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return { notes, deletions };
}
