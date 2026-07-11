import type { Note } from "./types";
import { displayDomain, sortNotes } from "./notes";

function cleanFilePart(value: string): string {
  return value.replace(/[:.]/g, "-");
}

export function notesToMarkdown(notes: Note[]): string {
  const sections = sortNotes(notes).map((note) => {
    const lines = [
      `## ${new Date(note.createdAt).toLocaleString()}`,
      "",
      note.content || "_No comment_",
    ];

    if (note.selection) {
      lines.push("", note.selection.split("\n").map((line) => `> ${line}`).join("\n"));
    }
    if (note.url) {
      lines.push("", `Source: [${note.title || displayDomain(note.url)}](${note.url})`);
    }
    if (note.tags.length) lines.push("", note.tags.map((tag) => `#${tag}`).join(" "));
    return lines.join("\n");
  });

  return ["# Folio", "", `Exported ${new Date().toLocaleString()}`, "", ...sections].join("\n\n");
}

export function downloadExport(notes: Note[], format: "markdown" | "json"): void {
  const generatedAt = cleanFilePart(new Date().toISOString());
  const isMarkdown = format === "markdown";
  const content = isMarkdown ? notesToMarkdown(notes) : JSON.stringify(sortNotes(notes), null, 2);
  const blob = new Blob([content], {
    type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `folio-${generatedAt}.${isMarkdown ? "md" : "json"}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
