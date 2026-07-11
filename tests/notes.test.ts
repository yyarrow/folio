import { describe, expect, it } from "vitest";
import { extractTags, matchesSearch, sortNotes } from "../lib/notes";
import { notesToMarkdown } from "../lib/export";
import type { Note } from "../lib/types";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "1",
    content: "An idea about #Writing and #AI",
    tags: ["writing", "ai"],
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("note helpers", () => {
  it("extracts unique multilingual tags", () => {
    expect(extractTags("#AI 一个想法 #写作 #AI #agent-tools")).toEqual([
      "ai",
      "写作",
      "agent-tools",
    ]);
  });

  it("searches note content, context, and tags", () => {
    expect(matchesSearch(note({ title: "A useful page" }), "useful")).toBe(true);
    expect(matchesSearch(note({ selection: "Quoted passage" }), "passage")).toBe(true);
    expect(matchesSearch(note(), "missing")).toBe(false);
  });

  it("sorts newest updates first", () => {
    const older = note({ id: "old", updatedAt: "2026-07-10T10:00:00.000Z" });
    const newer = note({ id: "new", updatedAt: "2026-07-12T10:00:00.000Z" });
    expect(sortNotes([older, newer]).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("exports note context as readable markdown", () => {
    const markdown = notesToMarkdown([
      note({ title: "Source", url: "https://example.com/post", selection: "Keep this." }),
    ]);
    expect(markdown).toContain("> Keep this.");
    expect(markdown).toContain("[Source](https://example.com/post)");
    expect(markdown).toContain("#writing #ai");
  });
});
