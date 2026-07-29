"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearLocalData,
  consumeSharedContext,
  applySyncState,
  getLocalSyncState,
  listLocalNotes,
  prepareLocalForUser,
  queueDeletion,
  queueNote,
} from "@/lib/client-db";
import {
  displayDomain,
  extractTags,
  formatNoteDate,
  normalizeSharedContext,
} from "@/lib/notes";
import type { Note, PageContext, SyncState } from "@/lib/types";

type SessionState = "checking" | "signed-in" | "signed-out" | "offline";
type SaveState = "idle" | "saving" | "saved" | "queued";
type CurrentUser = { id: string; email: string };

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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [sendingLogin, setSendingLogin] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [deviceCode, setDeviceCode] = useState("");
  const [creatingDeviceCode, setCreatingDeviceCode] = useState(false);
  const [message, setMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncFromCloud = useCallback(async () => {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await getLocalSyncState()),
    });
    if (response.status === 401) throw new Error("AUTH");
    if (!response.ok) throw new Error("SYNC");
    const state = await response.json() as SyncState;
    setNotes(await applySyncState(state));
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
      if (new URLSearchParams(window.location.search).get("auth") === "expired") {
        setMessage("登录链接无效或已过期，请重新获取。");
      }
      const shared = await consumeSharedContext();
      if (shared) {
        setContext(normalizeSharedContext(shared));
        window.setTimeout(() => textareaRef.current?.focus(), 80);
      }

      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await response.json() as { authenticated: boolean; user?: CurrentUser | null };
        if (!data.authenticated || !data.user) {
          setSession("signed-out");
          return;
        }
        setCurrentUser(data.user);
        await prepareLocalForUser(data.user.id);
        setSession("signed-in");
        await syncFromCloud();
      } catch {
        setSession("offline");
        setMessage("当前离线，笔记将保存在本机。");
      }
    })();

    const onOnline = () => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          const data = await response.json() as { authenticated: boolean; user?: CurrentUser | null };
          if (!data.authenticated || !data.user) {
            setCurrentUser(null);
            setSession("signed-out");
            return;
          }
          setCurrentUser(data.user);
          await prepareLocalForUser(data.user.id);
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
    if (sendingLogin) return;
    setSendingLogin(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/email-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, inviteCode }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; previewUrl?: string };
      if (!response.ok) {
        setMessage(data.error ?? "暂时无法发送登录邮件。");
        return;
      }
      setInviteCode("");
      setMessage("登录链接已发送，请查收邮件。");
      if (data.previewUrl) window.location.href = data.previewUrl;
    } finally {
      setSendingLogin(false);
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
    setMessage("已保存到本机，恢复网络后同步。");
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
    await queueDeletion(note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    if (editingId === note.id) await resetComposer();
    if (session === "signed-in" && navigator.onLine) {
      try {
        await syncFromCloud();
        return;
      } catch {
        setSession("offline");
      }
    }
    setMessage("已在本机删除，恢复网络后同步。");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await clearLocalData();
    setNotes([]);
    setCurrentUser(null);
    setShowAccountMenu(false);
    setDeviceCode("");
    setSession("signed-out");
  }

  async function handleCreateDeviceCode() {
    if (creatingDeviceCode) return;
    setCreatingDeviceCode(true);
    setDeviceCode("");
    try {
      const response = await fetch("/api/auth/device-code", { method: "POST" });
      const data = await response.json().catch(() => ({})) as { code?: string; error?: string };
      if (!response.ok || !data.code) {
        setMessage(data.error ?? "暂时无法生成连接码。");
        return;
      }
      setDeviceCode(data.code);
    } finally {
      setCreatingDeviceCode(false);
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `folio-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteAccount() {
    if (!window.confirm("永久删除账号和全部云端笔记？此操作无法撤销。")) return;
    if (window.prompt("请输入 DELETE 确认删除") !== "DELETE") return;
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    if (!response.ok) {
      setMessage("暂时无法删除账号。");
      return;
    }
    await clearLocalData();
    setNotes([]);
    setCurrentUser(null);
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
          <p className="eyebrow">Every idea matters.</p>
          <h1>每个想法，<br />都值得记下。</h1>
          <p className="login-copy">一个随时打开、随处记录的轻量笔记工具。</p>
          <form onSubmit={handleLogin}>
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
            <label htmlFor="invite-code">邀请码 <span>首次使用时填写</span></label>
            <input
              id="invite-code"
              type="password"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="已有账号可留空"
              autoComplete="one-time-code"
            />
            <button disabled={!email.trim() || sendingLogin}>{sendingLogin ? "发送中…" : "发送登录链接"}</button>
          </form>
          {message && <p className="form-message" role="status">{message}</p>}
          <a className="privacy-link" href="/privacy">隐私与数据</a>
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
            <i /> {session === "signed-in" ? "已同步" : "离线"}
          </span>
          <button className="more-button" onClick={() => setShowAccountMenu((open) => !open)} aria-label="账号设置">•••</button>
          {showAccountMenu && (
            <div className="account-menu">
              <div className="account-email">{currentUser?.email}</div>
              <button onClick={() => void handleCreateDeviceCode()} disabled={creatingDeviceCode}>
                {creatingDeviceCode ? "生成中…" : "连接浏览器插件"}
              </button>
              {deviceCode && (
                <div className="device-code" role="status">
                  <strong>{deviceCode}</strong>
                  <span>10 分钟内在插件中输入</span>
                </div>
              )}
              <button onClick={handleExport}>导出 JSON</button>
              <a href="/privacy">隐私与数据</a>
              <button onClick={() => void handleLogout()}>退出登录</button>
              <button className="danger" onClick={() => void handleDeleteAccount()}>删除账号</button>
            </div>
          )}
        </div>
      </header>

      <div className="content-column">
        <section className="intro">
          <h1>新建笔记</h1>
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
            placeholder={context.selection ? "为这段内容添加笔记…" : "写下想法…"}
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
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存 ✓" : saveState === "queued" ? "待同步 ✓" : "保存"}
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
