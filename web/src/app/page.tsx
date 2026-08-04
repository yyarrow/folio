"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LOCAL_SCOPE,
  countLocalNotes,
  clearLocalData,
  consumeSharedContext,
  applySyncState,
  getCachedWorkspace,
  getLocalSyncState,
  listLocalNotes,
  mergeLocalNotesIntoUser,
  queueDeletion,
  queueNote,
  rememberLocalWorkspace,
  rememberUserWorkspace,
  scopeForUser,
} from "@/lib/client-db";
import {
  displayDomain,
  extractTags,
  formatNoteDate,
  normalizeSharedContext,
} from "@/lib/notes";
import type { Note, PageContext, SyncState } from "@/lib/types";

type SessionState = "checking" | "signed-in" | "signed-out" | "offline" | "storage-error";
type SaveState = "idle" | "saving" | "saved" | "queued" | "local";
type CurrentUser = { id: string; email: string };

const EXTENSION_DOWNLOAD_URL = "https://github.com/yyarrow/folio/releases/latest/download/folio-extension.zip";

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
  const [workspaceScope, setWorkspaceScope] = useState(LOCAL_SCOPE);
  const [localNoteCount, setLocalNoteCount] = useState(0);
  const [showMergePrompt, setShowMergePrompt] = useState(false);
  const [mergingLocal, setMergingLocal] = useState(false);
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

  const syncFromCloud = useCallback(async (scope: string) => {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await getLocalSyncState(scope)),
    });
    if (response.status === 401) throw new Error("AUTH");
    if (!response.ok) throw new Error("SYNC");
    const state = await response.json() as SyncState;
    setNotes(await applySyncState(scope, state));
    setMessage("");
  }, []);

  const openWorkspace = useCallback(async (scope: string) => {
    setWorkspaceScope(scope);
    setNotes(await listLocalNotes(scope));
  }, []);

  const activateAuthenticatedUser = useCallback(async (user: CurrentUser, offerLocalMerge = false) => {
    const scope = await rememberUserWorkspace(user);
    const localCount = await countLocalNotes();
    setCurrentUser(user);
    setLocalNoteCount(localCount);
    await openWorkspace(scope);
    setSession("signed-in");
    try {
      await syncFromCloud(scope);
    } catch {
      setSession("offline");
      setMessage("当前离线，笔记将保存在本机，联网后继续同步。");
    }
    if (offerLocalMerge && localCount > 0) setShowMergePrompt(true);
  }, [openWorkspace, syncFromCloud]);

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
      const search = new URLSearchParams(window.location.search);
      const authResult = search.get("auth");
      if (authResult === "expired") {
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
          await rememberLocalWorkspace();
          await openWorkspace(LOCAL_SCOPE);
          setLocalNoteCount(await countLocalNotes());
          setCurrentUser(null);
          setSession("signed-out");
          return;
        }
        await activateAuthenticatedUser(data.user, authResult === "success");
      } catch {
        const cached = await getCachedWorkspace();
        await openWorkspace(cached.scope);
        setCurrentUser(cached.user ?? null);
        setLocalNoteCount(await countLocalNotes());
        setSession("offline");
        setMessage("当前离线，笔记将保存在本机。");
      } finally {
        if (authResult) {
          search.delete("auth");
          const query = search.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        }
      }
    })().catch(() => {
      setSession("storage-error");
      setMessage("本地存储暂时无法打开。请关闭其他 Folio 页面后重试。");
    });

    const onOnline = () => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          const data = await response.json() as { authenticated: boolean; user?: CurrentUser | null };
          if (!data.authenticated || !data.user) {
            await rememberLocalWorkspace();
            await openWorkspace(LOCAL_SCOPE);
            setCurrentUser(null);
            setLocalNoteCount(await countLocalNotes());
            setSession("signed-out");
            return;
          }
          await activateAuthenticatedUser(data.user);
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
  }, [activateAuthenticatedUser, openWorkspace]);

  useEffect(() => {
    if (session !== "signed-in") return;
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void syncFromCloud(workspaceScope).catch(() => setSession("offline"));
      }
    };
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => document.removeEventListener("visibilitychange", syncWhenVisible);
  }, [session, syncFromCloud, workspaceScope]);

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

    await queueNote(workspaceScope, note);
    setNotes((current) => sortNotes([...current.filter((item) => item.id !== note.id), note]));
    if (workspaceScope === LOCAL_SCOPE) setLocalNoteCount((count) => count + (existing ? 0 : 1));
    setContent("");
    setContext({});
    setEditingId(null);

    if (session === "signed-in" && navigator.onLine) {
      try {
        await syncFromCloud(workspaceScope);
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 800);
        return;
      } catch {
        setSession("offline");
      }
    }
    const localOnly = workspaceScope === LOCAL_SCOPE;
    setSaveState(localOnly ? "local" : "queued");
    setMessage(localOnly ? "已保存到这台设备。连接 Folio Cloud 后可跨设备同步。" : "已保存到本机，恢复网络后同步。");
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
    await queueDeletion(workspaceScope, note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    if (workspaceScope === LOCAL_SCOPE) setLocalNoteCount((count) => Math.max(0, count - 1));
    if (editingId === note.id) await resetComposer();
    if (session === "signed-in" && navigator.onLine) {
      try {
        await syncFromCloud(workspaceScope);
        return;
      } catch {
        setSession("offline");
      }
    }
    setMessage(workspaceScope === LOCAL_SCOPE ? "已从这台设备删除。" : "已在本机删除，恢复网络后同步。");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await rememberLocalWorkspace();
    await openWorkspace(LOCAL_SCOPE);
    setLocalNoteCount(await countLocalNotes());
    setCurrentUser(null);
    setShowAccountMenu(false);
    setDeviceCode("");
    setSession("signed-out");
  }

  async function handleMergeLocalNotes() {
    if (!currentUser || mergingLocal || !navigator.onLine) {
      setMessage("需要联网后才能合并到 Folio Cloud。");
      return;
    }
    setMergingLocal(true);
    setMessage("");
    try {
      const result = await mergeLocalNotesIntoUser(currentUser.id);
      setWorkspaceScope(result.scope);
      setNotes(await listLocalNotes(result.scope));
      await syncFromCloud(result.scope);
      await clearLocalData(LOCAL_SCOPE);
      setLocalNoteCount(0);
      setShowMergePrompt(false);
      setMessage(`已将 ${result.count} 条本地笔记安全合并到 Folio Cloud。`);
    } catch {
      setMessage("暂时无法完成合并，本地笔记仍安全保留在这台设备。");
    } finally {
      setMergingLocal(false);
    }
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
    const deletedScope = workspaceScope;
    await clearLocalData(deletedScope);
    await rememberLocalWorkspace();
    await openWorkspace(LOCAL_SCOPE);
    setLocalNoteCount(await countLocalNotes());
    setCurrentUser(null);
    setSession("signed-out");
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setShowAccountMenu(false);
  }

  if (session === "checking") {
    return (
      <main className="loading-screen">
        <FolioMark />
        <span>Folio</span>
      </main>
    );
  }

  if (session === "storage-error") {
    return (
      <main className="storage-error-screen">
        <FolioMark />
        <h1>本地笔记没有丢失</h1>
        <p>{message}</p>
        <button onClick={() => window.location.reload()}>重新打开 Folio</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><FolioMark /><span>Folio</span></div>
        <div className="top-actions">
          <button
            className="install-button"
            onClick={() => setShowAccountMenu((open) => !open)}
            aria-expanded={showAccountMenu}
          >
            安装
          </button>
          <span className={`sync-status ${session}`}>
            <i /> {session === "signed-in" ? "已同步" : session === "signed-out" ? "仅本机" : "离线"}
          </span>
          <button className="more-button" onClick={() => setShowAccountMenu((open) => !open)} aria-label="账号设置">•••</button>
          {showAccountMenu && (
            <div className="account-menu">
              <div className="install-options">
                {installPrompt && <button onClick={() => void handleInstall()}>安装网页版</button>}
                <a href={EXTENSION_DOWNLOAD_URL}>下载浏览器插件</a>
                <small>下载并解压 → 打开 chrome://extensions → 开启开发者模式并加载已解压的扩展。</small>
              </div>
              {currentUser ? (
                <>
                  <div className="account-email">{currentUser.email}</div>
                  <button onClick={() => void handleCreateDeviceCode()} disabled={creatingDeviceCode || session === "offline"}>
                    {creatingDeviceCode ? "生成中…" : "连接浏览器插件"}
                  </button>
                  {deviceCode && (
                    <div className="device-code" role="status">
                      <strong>{deviceCode}</strong>
                      <span>10 分钟内在插件中输入</span>
                    </div>
                  )}
                  {localNoteCount > 0 && (
                    <button onClick={() => void handleMergeLocalNotes()} disabled={mergingLocal || session === "offline"}>
                      {mergingLocal ? "合并中…" : `合并本地笔记（${localNoteCount}）`}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="local-account-copy">
                    <strong>Folio Local</strong>
                    <span>无需账号，笔记仅保存在这台设备。</span>
                  </div>
                  <form className="account-login" onSubmit={handleLogin}>
                    <label htmlFor="email">连接 Folio Cloud</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="邮箱"
                      autoComplete="email"
                    />
                    <input
                      id="invite-code"
                      type="password"
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value)}
                      placeholder="邀请码 · 已有账号可留空"
                      autoComplete="one-time-code"
                    />
                    <button disabled={!email.trim() || sendingLogin}>{sendingLogin ? "发送中…" : "发送登录链接"}</button>
                  </form>
                </>
              )}
              <button onClick={handleExport}>导出 JSON</button>
              <a href="/privacy">隐私与数据</a>
              {currentUser && <button onClick={() => void handleLogout()}>退出登录</button>}
              {currentUser && <button className="danger" onClick={() => void handleDeleteAccount()}>删除账号</button>}
            </div>
          )}
        </div>
      </header>

      <div className="content-column">
        <section className="intro">
          <p>Every idea matters.</p>
          <h1>{session === "signed-out" ? "记下此刻" : "新建笔记"}</h1>
        </section>

        {session === "signed-out" && (
          <aside className="local-notice">
            <div>
              <strong>仅保存在这台设备</strong>
              <span>清除浏览器数据或卸载应用可能导致笔记丢失。</span>
            </div>
            <button onClick={() => setShowAccountMenu(true)}>连接云端</button>
          </aside>
        )}

        {showMergePrompt && localNoteCount > 0 && currentUser && (
          <aside className="merge-notice" role="dialog" aria-label="合并本地笔记">
            <div>
              <strong>发现 {localNoteCount} 条本地笔记</strong>
              <span>确认后才会复制到 {currentUser.email}，同步成功前不会删除本地数据。</span>
            </div>
            <div className="merge-actions">
              <button className="merge-later" onClick={() => setShowMergePrompt(false)}>暂不合并</button>
              <button onClick={() => void handleMergeLocalNotes()} disabled={mergingLocal}>
                {mergingLocal ? "合并中…" : "合并到云端"}
              </button>
            </div>
          </aside>
        )}

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
                {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存 ✓" : saveState === "queued" ? "待同步 ✓" : saveState === "local" ? "已存本机 ✓" : "保存"}
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
