"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearLocalData,
  consumeSharedContext,
  listLocalNotes,
  listPendingNotes,
  markNoteSynced,
  queueNote,
  removeLocalNote,
  replaceCachedNotes,
} from "@/lib/client-db";
import {
  displayDomain,
  extractTags,
  formatNoteDate,
  normalizeSharedContext,
} from "@/lib/notes";
import type { Note, PageContext } from "@/lib/types";

type SessionState = "checking" | "signed-in" | "signed-out" | "offline";
type SaveState = "idle" | "saving" | "saved" | "queued";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function FolioMark() {
  return <span className="folio-mark" aria-hidden="true"><i /><b /><em /></span>;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [context, setContext] = useState<PageContext>({});
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>("checking");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [accessKey, setAccessKey] = useState("");
  const [message, setMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncFromCloud = useCallback(async () => {
    for (const note of await listPendingNotes()) {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(note),
      });
      if (response.status === 401) throw new Error("AUTH");
      if (!response.ok) throw new Error("SYNC");
      await markNoteSynced(note.id);
    }

    const response = await fetch("/api/notes", { cache: "no-store" });
    if (response.status === 401) throw new Error("AUTH");
    if (!response.ok) throw new Error("SYNC");
    const data = await response.json() as { notes: Note[] };
    setNotes(await replaceCachedNotes(data.notes));
    setMessage("");
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then(() => {
        const cacheLoadedAssets = () => {
          const urls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.startsWith(window.location.origin));
          navigator.serviceWorker.ready.then((registration) => {
            registration.active?.postMessage({ type: "CACHE_URLS", urls });
          }).catch(() => undefined);
        };
        if (document.readyState === "complete") cacheLoadedAssets();
        else window.addEventListener("load", cacheLoadedAssets, { once: true });
      });
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);

    void (async () => {
      setNotes(await listLocalNotes());
      const shared = await consumeSharedContext();
      if (shared) {
        setContext(normalizeSharedContext(shared));
        window.setTimeout(() => textareaRef.current?.focus(), 80);
      }

      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await response.json() as { authenticated: boolean };
        if (!data.authenticated) {
          setSession("signed-out");
          return;
        }
        setSession("signed-in");
        await syncFromCloud();
      } catch {
        setSession("offline");
        setMessage("当前离线，笔记会先安全地留在这台手机。");
      }
    })();

    const onOnline = () => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          const data = await response.json() as { authenticated: boolean };
          if (!data.authenticated) {
            setSession("signed-out");
            return;
          }
          setSession("signed-in");
          await syncFromCloud();
        } catch {
          setSession("offline");
        }
      })();
    };
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("online", onOnline);
    };
  }, [syncFromCloud]);

  const visibleNotes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return notes;
    return notes.filter((note) =>
      [note.content, note.title, note.url, note.selection, note.tags.join(" ")]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalized)),
    );
  }, [notes, query]);
  const tags = useMemo(() => extractTags(content), [content]);
  const canSave = Boolean(content.trim() || context.selection);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessKey }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "暂时无法登录。");
      return;
    }
    setAccessKey("");
    setSession("signed-in");
    try {
      await syncFromCloud();
    } catch {
      setMessage("已登录，云端暂时不可用；仍可离线记录。");
    }
  }

  function resetComposer() {
    setContent("");
    setContext({});
    setEditingId(null);
    setSaveState("idle");
    textareaRef.current?.focus();
  }

  async function handleSave() {
    if (!canSave || saveState === "saving") return;
    setSaveState("saving");
    const existing = editingId ? notes.find((note) => note.id === editingId) : undefined;
    const now = new Date().toISOString();
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

    await queueNote(note);
    setNotes((current) => sortNotes([...current.filter((item) => item.id !== note.id), note]));
    setContent("");
    setContext({});
    setEditingId(null);

    if (session === "signed-in" && navigator.onLine) {
      try {
        await syncFromCloud();
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 800);
        return;
      } catch {
        setSession("offline");
      }
    }
    setSaveState("queued");
    setMessage("已保存到手机，联网后会自动同步。");
    window.setTimeout(() => setSaveState("idle"), 900);
  }

  function handleEdit(note: Note) {
    setEditingId(note.id);
    setContent(note.content);
    setContext({ title: note.title, url: note.url, selection: note.selection });
    setSaveState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => textareaRef.current?.focus(), 250);
  }

  async function handleDelete(note: Note) {
    if (!window.confirm("删除这条笔记？")) return;
    if (session !== "signed-in" || !navigator.onLine) {
      setMessage("删除需要联网，稍后再试。");
      return;
    }
    const response = await fetch(`/api/notes/${encodeURIComponent(note.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("暂时无法删除这条笔记。");
      return;
    }
    await removeLocalNote(note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await clearLocalData();
    setNotes([]);
    setSession("signed-out");
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (session === "checking") {
    return (
      <main className="loading-screen">
        <FolioMark />
        <span>Folio</span>
      </main>
    );
  }

  if (session === "signed-out") {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand"><FolioMark /><span>Folio</span></div>
          <p className="eyebrow">你的私人收件箱</p>
          <h1>把闪过的念头，<br />先稳稳接住。</h1>
          <p className="login-copy">登录一次，以后从微信读书、浏览器或桌面图标都能快速记下。</p>
          <form onSubmit={handleLogin}>
            <label htmlFor="access-key">访问密钥</label>
            <input
              id="access-key"
              type="password"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              placeholder="输入你的 Folio 密钥"
              autoComplete="current-password"
              autoFocus
            />
            <button disabled={!accessKey}>进入 Folio</button>
          </form>
          {message && <p className="form-message" role="status">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><FolioMark /><span>Folio</span></div>
        <div className="top-actions">
          {installPrompt && <button className="install-button" onClick={() => void handleInstall()}>安装</button>}
          <span className={`sync-status ${session}`}>
            <i /> {session === "signed-in" ? "云端" : "离线"}
          </span>
          <button className="more-button" onClick={() => void handleLogout()} aria-label="退出登录">•••</button>
        </div>
      </header>

      <div className="content-column">
        <section className="intro">
          <p>随手记</p>
          <h1>此刻，有什么值得留下？</h1>
        </section>

        <section className="composer" aria-label="新笔记">
          {(context.url || context.selection || context.title) && (
            <div className="context-card">
              {context.selection && <blockquote>{context.selection}</blockquote>}
              {(context.url || context.title) && (
                context.url ? (
                  <a href={context.url} target="_blank" rel="noreferrer">
                    <span className="source-arrow">↗</span>
                    <span>{context.title || displayDomain(context.url)}</span>
                    <small>{displayDomain(context.url)}</small>
                  </a>
                ) : (
                  <div className="context-title">{context.title}</div>
                )
              )}
              <button className="clear-context" onClick={() => setContext({})} aria-label="移除来源">×</button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => { setContent(event.target.value); setSaveState("idle"); }}
            placeholder={context.selection ? "这段话让你想到了什么？" : "先写下来，不必整理…"}
            rows={7}
          />

          <footer className="composer-footer">
            <div className="tag-preview">
              {tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
              {!tags.length && <span className="hint">可用 #标签</span>}
            </div>
            <div className="composer-actions">
              {editingId && <button className="cancel-button" onClick={resetComposer}>取消</button>}
              <button className={`save-button ${saveState}`} disabled={!canSave || saveState === "saving"} onClick={() => void handleSave()}>
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已同步 ✓" : saveState === "queued" ? "已收下 ✓" : "保存"}
              </button>
            </div>
          </footer>
        </section>

        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}

        <section className="library" aria-label="最近笔记">
          <div className="library-heading">
            <h2>最近</h2>
            <span>{notes.length}</span>
          </div>
          <label className="search-field">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记、网页或标签" />
            {query && <button onClick={() => setQuery("")} aria-label="清空搜索">×</button>}
          </label>

          <div className="note-list">
            {visibleNotes.map((note) => (
              <article className="note-card" key={note.id}>
                {note.content && <p>{note.content}</p>}
                {note.selection && <blockquote>{note.selection}</blockquote>}
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
                    <button onClick={() => void handleDelete(note)}>删除</button>
                  </div>
                </footer>
              </article>
            ))}
            {!visibleNotes.length && (
              <div className="empty-state">
                <FolioMark />
                <strong>{query ? "没有匹配的笔记" : "这里还很安静"}</strong>
                <p>{query ? "换一个词或标签试试。" : "从一句话开始就好。"}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
