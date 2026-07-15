import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadExport } from "../../lib/export";
import { listNotes, removeNote, saveNote } from "../../lib/db";
import { clearDraft, loadDraft, persistDraft } from "../../lib/draft";
import {
  displayDomain,
  extractTags,
  formatNoteDate,
  matchesSearch,
} from "../../lib/notes";
import type { Note, PageContext } from "../../lib/types";

const MAX_SELECTION_LENGTH = 12_000;

async function readPageContext(): Promise<PageContext> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return {};

  const context: PageContext = { title: tab.title, url: tab.url };
  if (!tab.id || !tab.url || !/^(https?|file):/.test(tab.url)) return context;

  try {
    if (import.meta.env.FIREFOX) {
      const results = await browser.tabs.executeScript(tab.id, {
        code: "window.getSelection()?.toString().trim() ?? ''",
      });
      context.selection = String(results?.[0] ?? "").slice(0, MAX_SELECTION_LENGTH) || undefined;
    } else {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString().trim() ?? "",
      });
      context.selection = results[0]?.result?.slice(0, MAX_SELECTION_LENGTH) || undefined;
    }
  } catch {
    // Browser-internal and protected pages cannot be scripted; URL metadata still works.
  }
  return context;
}

function FolioMark() {
  return (
    <svg aria-hidden="true" className="folio-mark" viewBox="0 0 32 32">
      <path d="M8 5.5h12a4 4 0 0 1 4 4v17H11a3 3 0 0 1-3-3v-18Z" />
      <path d="M11 5.5v16.8c0 1.7-3 1.7-3 0M14.5 11h5M14.5 15h5M14.5 19h3.5" />
    </svg>
  );
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [context, setContext] = useState<PageContext>({});
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showMenu, setShowMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshNotes = useCallback(async () => setNotes(await listNotes()), []);
  const refreshContext = useCallback(async () => setContext(await readPageContext()), []);

  useEffect(() => {
    void (async () => {
      const [draft] = await Promise.all([loadDraft(), refreshNotes()]);
      if (draft) {
        setContent(draft.content);
        setContext(draft.context);
        setEditingId(draft.editingId);
      } else {
        await refreshContext();
      }
      setReady(true);
      window.setTimeout(() => textareaRef.current?.focus(), 60);
    })();
  }, [refreshContext, refreshNotes]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      if (content.trim() || editingId) {
        void persistDraft({
          content,
          context,
          editingId,
          updatedAt: new Date().toISOString(),
        });
      } else {
        void clearDraft();
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [content, context, editingId, ready]);

  const visibleNotes = useMemo(
    () => notes.filter((note) => matchesSearch(note, query)),
    [notes, query],
  );
  const tags = useMemo(() => extractTags(content), [content]);
  const canSave = Boolean(content.trim() || context.selection);

  const resetComposer = useCallback(async () => {
    await clearDraft();
    setContent("");
    setEditingId(null);
    setStatus("idle");
    await refreshContext();
    textareaRef.current?.focus();
  }, [refreshContext]);

  async function handleSave() {
    if (!canSave || status === "saving") return;
    setStatus("saving");
    const now = new Date().toISOString();
    const existing = editingId ? notes.find((note) => note.id === editingId) : undefined;
    const note: Note = {
      id: existing?.id ?? crypto.randomUUID(),
      content: content.trim(),
      title: context.title,
      url: context.url,
      selection: context.selection,
      tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await saveNote(note);
    await clearDraft();
    await refreshNotes();
    setStatus("saved");
    window.setTimeout(() => void resetComposer(), 420);
  }

  function handleEdit(note: Note) {
    setEditingId(note.id);
    setContent(note.content);
    setContext({ title: note.title, url: note.url, selection: note.selection });
    setStatus("idle");
    textareaRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(note: Note) {
    if (!window.confirm("删除这条笔记？")) return;
    await removeNote(note.id);
    if (editingId === note.id) await resetComposer();
    await refreshNotes();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <FolioMark />
          <span>Folio</span>
        </div>
        <div className="top-actions">
          <span className="local-status"><i /> 本地</span>
          <button className="icon-button" onClick={() => setShowMenu((open) => !open)} aria-label="More options">•••</button>
          {showMenu && (
            <div className="export-menu">
              <button onClick={() => { downloadExport(notes, "markdown"); setShowMenu(false); }}>导出 Markdown</button>
              <button onClick={() => { downloadExport(notes, "json"); setShowMenu(false); }}>导出 JSON</button>
            </div>
          )}
        </div>
      </header>

      <section className="composer" aria-label="New note">
        <div className="composer-heading">
          <span>{editingId ? "编辑笔记" : "记下此刻"}</span>
          {editingId && <button className="text-button" onClick={() => void resetComposer()}>取消</button>}
        </div>

        {(context.url || context.selection) && (
          <div className="context-card">
            {context.selection && <blockquote>{context.selection}</blockquote>}
            {context.url && (
              <a href={context.url} target="_blank" rel="noreferrer" title={context.title}>
                <span className="source-dot">↗</span>
                <span>{context.title || displayDomain(context.url)}</span>
                <small>{displayDomain(context.url)}</small>
              </a>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => { setContent(event.target.value); setStatus("idle"); }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
          }}
          placeholder="此刻有什么值得留下？"
          rows={6}
        />

        <div className="composer-footer">
          <div className="tag-preview">
            {tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
            {!tags.length && <span className="hint">需要时可用 #标签</span>}
          </div>
          <button className={`save-button ${status}`} disabled={!canSave || status === "saving"} onClick={() => void handleSave()}>
            {status === "saving" ? "保存中…" : status === "saved" ? "已保存 ✓" : "保存"}
            {status === "idle" && <kbd>⌘↵</kbd>}
          </button>
        </div>
      </section>

      <section className="library" aria-label="Notes">
        <div className="library-heading">
          <h1>最近</h1>
          <span>{notes.length}</span>
        </div>
        <label className="search-field">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记、网页或标签" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        <div className="note-list">
          {visibleNotes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-copy">
                {note.content && <p>{note.content}</p>}
                {note.selection && <blockquote>{note.selection}</blockquote>}
              </div>
              {note.tags.length > 0 && <div className="note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
              <footer>
                <div className="note-meta">
                  <time>{formatNoteDate(note.updatedAt)}</time>
                  {note.url && (
                    <a href={note.url} target="_blank" rel="noreferrer" title={note.title || displayDomain(note.url)}>
                      {note.title || displayDomain(note.url)}
                    </a>
                  )}
                </div>
                <div className="note-actions">
                  <button onClick={() => handleEdit(note)}>编辑</button>
                  <button className="danger" onClick={() => void handleDelete(note)}>删除</button>
                </div>
              </footer>
            </article>
          ))}

          {!visibleNotes.length && (
            <div className="empty-state">
              <FolioMark />
              <strong>{query ? "没有匹配的笔记" : "还没有笔记"}</strong>
              <p>{query ? "换一个词或标签试试。" : "一句话就够了，先写下此刻的想法。"}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
