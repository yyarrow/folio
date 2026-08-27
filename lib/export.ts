import type { Note } from "./types";
import { t } from "./i18n";
import { displayDomain, sortNotes } from "./notes";

export interface ExportLabels {
  noComment: string;
  source: string;
  exportedAt: string;
}

const defaultLabels: ExportLabels = {
  noComment: "No comment",
  source: "Source",
  exportedAt: "Exported",
};

function cleanFilePart(value: string): string {
  return value.replace(/[:.]/g, "-");
}

export function notesToMarkdown(notes: Note[], labels: ExportLabels = defaultLabels): string {
  const sections = sortNotes(notes).map((note) => {
    const lines = [
      `## ${new Date(note.createdAt).toLocaleString()}`,
      "",
      note.content || `_${labels.noComment}_`,
    ];

    if (note.selection) {
      lines.push("", note.selection.split("\n").map((line) => `> ${line}`).join("\n"));
    }
    if (note.url) {
      lines.push("", `${labels.source}: [${note.title || displayDomain(note.url)}](${note.url})`);
    }
    if (note.tags.length) lines.push("", note.tags.map((tag) => `#${tag}`).join(" "));
    return lines.join("\n");
  });

  return ["# Folio", "", `${labels.exportedAt} ${new Date().toLocaleString()}`, "", ...sections].join("\n\n");
}

export function downloadExport(notes: Note[], format: "markdown" | "json"): void {
  const generatedAt = cleanFilePart(new Date().toISOString());
  const isMarkdown = format === "markdown";
  const content = isMarkdown
    ? notesToMarkdown(notes, {
        noComment: t("exportNoComment"),
        source: t("exportSource"),
        exportedAt: t("exportedAt"),
      })
    : JSON.stringify(sortNotes(notes), null, 2);
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
