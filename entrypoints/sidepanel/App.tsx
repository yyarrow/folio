import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { downloadExport } from "../../lib/export";
import { t } from "../../lib/i18n";
import { listNotes, removeNote, saveNote } from "../../lib/db";
import { clearDraft, loadDraft, persistDraft } from "../../lib/draft";
import {
  CloudSyncError,
  connectCloud,
  disconnectCloud,
  isCloudConnected,
  syncCloud,
} from "../../lib/sync";
import {
  displayDomain,
  extractTags,
  formatNoteDate,
  matchesSearch,
} from "../../lib/notes";
import type { Note, PageContext } from "../../lib/types";
import NoteEditor from "./NoteEditor";

const MAX_SELECTION_LENGTH = 12_000;
const CONNECT_PAGE_URL = "https://folio.warmbeing.com/?connect=extension";
type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error";
type EditorTarget = { kind: "new" } | { kind: "note"; id: string };

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
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [draftState, setDraftState] = useState<"saved" | "pending" | "empty">("saved");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showMenu, setShowMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [deviceCode, setDeviceCode] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const legacyDraftRef = useRef(false);
  const pendingDeleteRef = useRef<{ note: Note; timer: number } | null>(null);

  const refreshNotes = useCallback(async () => setNotes(await listNotes()), []);
  const refreshContext = useCallback(async () => setContext(await readPageContext()), []);

  const runSync = useCallback(async (showFeedback = false) => {
    setSyncStatus("syncing");
    if (showFeedback) setSyncMessage("");
    try {
      const didSync = await syncCloud();
      if (!didSync) {
        setConnected(false);
        setSyncStatus("local");
        return;
      }
      await refreshNotes();
      setConnected(true);
      setSyncStatus("synced");
      if (showFeedback) setSyncMessage(t("syncComplete"));
    } catch (error) {
      if (error instanceof CloudSyncError && error.code === "unauthorized") {
        await disconnectCloud();
        setConnected(false);
        setSyncStatus("error");
        setSyncMessage(t("syncConnectionExpired"));
      } else {
        setSyncStatus("offline");
        if (showFeedback) setSyncMessage(t("syncUnavailableLocal"));
      }
    }
  }, [refreshNotes]);

  useEffect(() => {
    void (async () => {
      const [draft, cloudConnected, loadedNotes] = await Promise.all([
        loadDraft(),
        isCloudConnected(),
        listNotes(),
      ]);
      setNotes(loadedNotes);
      setConnected(cloudConnected);
      let openedEditor = false;
      if (draft) {
        // Migrate drafts saved by the old "edit in composer" flow: reopen that
        // note in the fullscreen editor (it autosaves) and clear the composer.
        const legacyNote = draft.editingId ? loadedNotes.find((note) => note.id === draft.editingId) : undefined;
        if (legacyNote && draft.content.trim() === legacyNote.content) {
          await clearDraft();
          await refreshContext();
        } else if (legacyNote) {
          setNoteDraft(draft.content);
          setDraftState("pending");
          setEditor({ kind: "note", id: legacyNote.id });
          openedEditor = true;
          legacyDraftRef.current = true;
          await refreshContext();
        } else {
          setContent(draft.content);
          setContext(draft.context);
        }
      } else {
        await refreshContext();
      }
      if (cloudConnected) await runSync();
      setReady(true);
      if (!openedEditor) window.setTimeout(() => textareaRef.current?.focus(), 60);
    })();
  }, [refreshContext, refreshNotes, runSync]);

  useEffect(() => {
    const handleOnline = () => void runSync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [runSync]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      if (content.trim()) {
        void persistDraft({
          content,
          context,
          editingId: null,
          updatedAt: new Date().toISOString(),
        });
      } else if (!legacyDraftRef.current) {
        void clearDraft();
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [content, context, ready]);

  const visibleNotes = useMemo(
    () => notes.filter((note) =>
      note.id !== pendingDelete?.id
      && (!tagFilter || note.tags.includes(tagFilter))
      && matchesSearch(note, query)),
    [notes, query, tagFilter, pendingDelete],
  );
  const tags = useMemo(() => extractTags(content), [content]);
  const canSave = Boolean(content.trim() || context.selection);

  const resetComposer = useCallback(async () => {
    await clearDraft();
    setContent("");
    setStatus("idle");
    await refreshContext();
    textareaRef.current?.focus();
  }, [refreshContext]);

  async function handleSave() {
    if (!canSave || status === "saving") return;
    setStatus("saving");
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      content: content.trim(),
      title: context.title,
      url: context.url,
      selection: context.selection,
      tags,
      createdAt: now,
      updatedAt: now,
    };
    await saveNote(note);
    await clearDraft();
    await refreshNotes();
    if (connected) await runSync();
    setStatus("saved");
    window.setTimeout(() => void resetComposer(), 420);
  }

  const editingNote = editor?.kind === "note" ? notes.find((note) => note.id === editor.id) : undefined;

  function openEditor(target: EditorTarget) {
    if (target.kind === "note") {
      const note = notes.find((item) => item.id === target.id);
      if (!note) return;
      setNoteDraft(note.content);
      setDraftState("saved");
    }
    setEditor(target);
  }

  async function saveNoteDraft(): Promise<boolean> {
    if (!editingNote) return false;
    const nextContent = noteDraft.trim();
    if (nextContent === editingNote.content) return false;
    if (!nextContent && !editingNote.selection) {
      setDraftState("empty");
      return false;
    }
    await saveNote({
      ...editingNote,
      content: nextContent,
      tags: extractTags(nextContent),
      updatedAt: new Date().toISOString(),
    });
    await refreshNotes();
    if (legacyDraftRef.current) {
      legacyDraftRef.current = false;
      await clearDraft();
    }
    setDraftState("saved");
    return true;
  }

  function closeEditor() {
    if (editor?.kind === "note") {
      void saveNoteDraft().then((changed) => {
        if (changed && connected) void runSync();
      });
    }
    setEditor(null);
    if (!editor || editor.kind === "new") window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!editingNote) return;
    if (noteDraft.trim() === editingNote.content) return;
    setDraftState("pending");
    const timer = window.setTimeout(() => void saveNoteDraft(), 700);
    return () => window.clearTimeout(timer);
    // saveNoteDraft reads the same state this effect depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDraft, editingNote]);

  // Closing the side panel skips the debounce, so flush as soon as it is hidden.
  const flushNoteDraftRef = useRef(saveNoteDraft);
  flushNoteDraftRef.current = saveNoteDraft;
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") void flushNoteDraftRef.current(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  async function commitDeletion(note: Note) {
    await removeNote(note.id);
    await refreshNotes();
    if (connected) await runSync();
  }
  const commitDeletionRef = useRef(commitDeletion);
  commitDeletionRef.current = commitDeletion;

  function flushPendingDelete() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    void commitDeletionRef.current(pending.note);
  }
  const flushPendingDeleteRef = useRef(flushPendingDelete);
  flushPendingDeleteRef.current = flushPendingDelete;

  function handleDelete(note: Note) {
    flushPendingDelete();
    if (editor?.kind === "note" && editor.id === note.id) setEditor(null);
    const timer = window.setTimeout(() => flushPendingDeleteRef.current(), 5000);
    pendingDeleteRef.current = { note, timer };
    setPendingDelete(note);
  }

  function undoDelete() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
  }

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") flushPendingDeleteRef.current(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  async function handleConnect(event: FormEvent) {
    event.preventDefault();
    setSyncStatus("syncing");
    setSyncMessage("");
    try {
      await connectCloud(deviceCode);
      setConnected(true);
      setDeviceCode("");
      setSyncStatus("synced");
      setSyncMessage(t("connectedSynced"));
      await refreshNotes();
    } catch (error) {
      if (error instanceof CloudSyncError && error.code === "unauthorized") {
        setSyncStatus("error");
        setSyncMessage(t("codeInvalidExpired"));
      } else if (error instanceof CloudSyncError && error.code === "account-mismatch") {
        setSyncStatus("error");
        setSyncMessage(t("accountMismatch"));
      } else {
        setSyncStatus("offline");
        setSyncMessage(t("cloudUnavailable"));
      }
    }
  }

  async function handleDisconnect() {
    await disconnectCloud();
    setConnected(false);
    setSyncStatus("local");
    setSyncMessage(t("disconnectedLocal"));
  }

  const syncLabel: Record<SyncStatus, string> = {
    local: t("syncStatusLocal"),
    syncing: t("syncStatusSyncing"),
    synced: t("syncStatusSynced"),
    offline: t("syncStatusOffline"),
    error: t("syncStatusError"),
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <FolioMark />
          <span>Folio</span>
        </div>
        <div className="top-actions">
          <span className={`local-status ${syncStatus}`}><i /> {syncLabel[syncStatus]}</span>
          <button className="icon-button" onClick={() => setShowMenu((open) => !open)} aria-label={t("moreOptions")}>•••</button>
          {showMenu && (
            <div className="export-menu">
              {connected ? (
                <>
                  <button onClick={() => void runSync(true)}>{t("syncNow")}</button>
                  <button onClick={() => void handleDisconnect()}>{t("disconnectCloud")}</button>
                </>
              ) : (
                <form className="sync-connect" onSubmit={(event) => void handleConnect(event)}>
                  <label htmlFor="cloud-device-code">{t("connectCloud")}</label>
                  <input
                    id="cloud-device-code"
                    type="text"
                    value={deviceCode}
                    onChange={(event) => setDeviceCode(event.target.value.toUpperCase())}
                    placeholder={t("deviceCodePlaceholder")}
                    autoComplete="one-time-code"
                    maxLength={8}
                  />
                  <button className="connect-button" disabled={!deviceCode.trim() || syncStatus === "syncing"}>
                    {syncStatus === "syncing" ? t("connecting") : t("connectAndSync")}
                  </button>
                  <a className="connect-help" href={CONNECT_PAGE_URL} target="_blank" rel="noreferrer">{t("getDeviceCode")}</a>
                </form>
              )}
              <div className="menu-divider" />
              <button onClick={() => { downloadExport(notes, "markdown"); setShowMenu(false); }}>{t("exportMarkdown")}</button>
              <button onClick={() => { downloadExport(notes, "json"); setShowMenu(false); }}>{t("exportJson")}</button>
              {syncMessage && <p className="sync-message" role="status">{syncMessage}</p>}
            </div>
          )}
        </div>
      </header>

      <section className="composer" aria-label={t("newNote")}>
        <div className="composer-heading">
          <span>{t("captureMoment")}</span>
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
          placeholder={t("composerPlaceholder")}
          rows={6}
        />

        <div className="composer-footer">
          <div className="tag-preview">
            {tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
            {!tags.length && <span className="hint">{t("tagHint")}</span>}
          </div>
          <div className="composer-actions">
            <button className="expand-button" onClick={() => setEditor({ kind: "new" })} aria-label={t("fullscreenEdit")} title={t("fullscreenEdit")}>⤢</button>
            <button className={`save-button ${status}`} disabled={!canSave || status === "saving"} onClick={() => void handleSave()}>
              {status === "saving" ? t("saving") : status === "saved" ? t("saved") : t("save")}
              {status === "idle" && <kbd>⌘↵</kbd>}
            </button>
          </div>
        </div>
      </section>

      <section className="library" aria-label={t("notes")}>
        <div className="library-heading">
          <h1>{t("recent")}</h1>
          <span>{notes.length - (pendingDelete ? 1 : 0)}</span>
        </div>
        <label className="search-field">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
          {query && <button onClick={() => setQuery("")} aria-label={t("clearSearch")}>×</button>}
        </label>
        {tagFilter && (
          <button type="button" className="tag-filter" onClick={() => setTagFilter(null)} aria-label={t("clearTagFilter")}>
            #{tagFilter} <span aria-hidden="true">×</span>
          </button>
        )}

        <div className="note-list">
          {visibleNotes.map((note) => (
            <article className="note-card" key={note.id}>
              <div
                className="note-body"
                role="button"
                tabIndex={0}
                aria-label={t("openNote")}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a, button")) return;
                  if (!window.getSelection()?.toString()) openEditor({ kind: "note", id: note.id });
                }}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openEditor({ kind: "note", id: note.id });
                  }
                }}
              >
                {note.content && <div className="note-md">{renderMarkdown(note.content, { onTagClick: setTagFilter })}</div>}
                {note.selection && <blockquote>{note.selection}</blockquote>}
                {note.tags.length > 0 && <div className="note-tags">{note.tags.map((tag) => (
                  <button type="button" key={tag} onClick={(event) => { event.stopPropagation(); setTagFilter(tag); }}>#{tag}</button>
                ))}</div>}
              </div>
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
                  <button onClick={() => openEditor({ kind: "note", id: note.id })}>{t("edit")}</button>
                  <button className="danger" onClick={() => handleDelete(note)}>{t("delete")}</button>
                </div>
              </footer>
            </article>
          ))}

          {!visibleNotes.length && (
            <div className="empty-state">
              <FolioMark />
              <strong>{query || tagFilter ? t("noMatchingNotes") : t("noNotes")}</strong>
              <p>{query || tagFilter ? t("tryDifferentSearch") : t("emptyNotesDescription")}</p>
            </div>
          )}
        </div>
      </section>

      {pendingDelete && (
        <div className="undo-toast" role="status">
          <span>{t("deletedToast")}</span>
          <button type="button" onClick={undoDelete}>{t("undo")}</button>
        </div>
      )}

      {editor?.kind === "new" && (
        <NoteEditor
          heading={t("newNote")}
          value={content}
          context={context}
          placeholder={t("composerPlaceholder")}
          onChange={(value) => { setContent(value); setStatus("idle"); }}
          onClose={closeEditor}
          onSubmit={() => { closeEditor(); void handleSave(); }}
          submitLabel={t("save")}
          submitDisabled={!canSave || status === "saving"}
        />
      )}
      {editingNote && (
        <NoteEditor
          heading={formatNoteDate(editingNote.createdAt)}
          status={draftState === "pending" ? t("saving") : draftState === "empty" ? t("editorEmpty") : t("editorSaved")}
          value={noteDraft}
          context={editingNote}
          placeholder={t("composerPlaceholder")}
          onChange={setNoteDraft}
          onClose={closeEditor}
          onDelete={() => handleDelete(editingNote)}
        />
      )}
    </main>
  );
}
