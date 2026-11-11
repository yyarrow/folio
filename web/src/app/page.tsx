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
import { renderMarkdown } from "@/lib/markdown";
import DeviceCodeCard from "./device-code-card";
import NoteEditor from "./note-editor";
import { useI18n } from "./i18n-provider";

type SessionState = "checking" | "signed-in" | "signed-out" | "offline" | "storage-error";
type SaveState = "idle" | "saving" | "saved" | "queued" | "local";
type EditorTarget = { kind: "new" } | { kind: "note"; id: string };
type DraftState = "saved" | "pending" | "empty";
type CurrentUser = { id: string; email: string };

const CONNECT_INTENT_KEY = "folio-connect-extension";
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/folio/ieicolnjeafcjmbndojijhmeechipbee";

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
  const { t, lang, setLang } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const locale = lang === "zh" ? "zh-CN" : "en";
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [context, setContext] = useState<PageContext>({});
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [draftState, setDraftState] = useState<DraftState>("saved");
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
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistNote, setWaitlistNote] = useState("");
  const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [connectIntent, setConnectIntent] = useState(false);
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceCodeExpiresAt, setDeviceCodeExpiresAt] = useState("");
  const [creatingDeviceCode, setCreatingDeviceCode] = useState(false);
  const [message, setMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingDeleteRef = useRef<{ note: Note; timer: number } | null>(null);
  const commitDeletionRef = useRef<(note: Note) => Promise<void>>(async () => undefined);
  const flushPendingDeleteRef = useRef<() => void>(() => undefined);
  const closeEditorRef = useRef<(save: boolean) => void>(() => undefined);

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
      setMessage(tRef.current("offlineSyncLater"));
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
        setMessage(tRef.current("loginLinkExpired"));
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
        setMessage(tRef.current("offlineLocalOnly"));
      } finally {
        if (authResult) {
          search.delete("auth");
          const query = search.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        }
      }
    })().catch(() => {
      setSession("storage-error");
      setMessage(tRef.current("storageUnavailable"));
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
    return notes.filter((note) => {
      if (pendingDelete && note.id === pendingDelete.id) return false;
      if (tagFilter && !note.tags.includes(tagFilter)) return false;
      if (!normalized) return true;
      return [note.content, note.title, note.url, note.selection, note.tags.join(" ")]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalized));
    });
  }, [notes, query, tagFilter, pendingDelete]);
  const tags = useMemo(() => extractTags(content), [content]);
  const canSave = Boolean(content.trim() || context.selection);

  async function handleWaitlist(event: FormEvent) {
    event.preventDefault();
    if (submittingWaitlist) return;
    setSubmittingWaitlist(true);
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, note: waitlistNote }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(data.error ?? t("waitlistFailed"));
        return;
      }
      setWaitlistDone(true);
    } finally {
      setSubmittingWaitlist(false);
    }
  }

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
        setMessage(data.error ?? t("loginEmailFailed"));
        return;
      }
      setInviteCode("");
      setMessage(t("loginLinkSent"));
      if (data.previewUrl) window.location.href = data.previewUrl;
    } finally {
      setSendingLogin(false);
    }
  }

  async function persistNote(note: Note, isNew: boolean) {
    await queueNote(workspaceScope, note);
    setNotes((current) => sortNotes([...current.filter((item) => item.id !== note.id), note]));
    if (isNew && workspaceScope === LOCAL_SCOPE) setLocalNoteCount((count) => count + 1);
  }

  function syncInBackground() {
    if (session === "signed-in" && navigator.onLine) {
      void syncFromCloud(workspaceScope).catch(() => setSession("offline"));
    }
  }

  async function handleSave() {
    if (!canSave || saveState === "saving") return;
    setSaveState("saving");
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

    await persistNote(note, true);
    setContent("");
    setContext({});

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
    setMessage(localOnly ? t("savedLocalDevice") : t("savedQueued"));
    window.setTimeout(() => setSaveState("idle"), 900);
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
    // Let the Android back gesture close the editor instead of leaving the app.
    window.history.pushState({ folioEditor: true }, "");
  }

  async function saveNoteDraft(): Promise<boolean> {
    if (!editingNote) return false;
    const nextContent = noteDraft.trim();
    if (nextContent === editingNote.content) return false;
    if (!nextContent && !editingNote.selection) {
      setDraftState("empty");
      return false;
    }
    await persistNote({
      ...editingNote,
      content: nextContent,
      tags: extractTags(nextContent),
      updatedAt: new Date().toISOString(),
    }, false);
    setDraftState("saved");
    return true;
  }

  closeEditorRef.current = (save: boolean) => {
    if (save && editor?.kind === "note") {
      void saveNoteDraft().then((changed) => { if (changed) syncInBackground(); });
    }
    setEditor(null);
    window.setTimeout(() => { if (!editor || editor.kind === "new") textareaRef.current?.focus(); }, 0);
  };

  function closeEditor(save = true) {
    if (window.history.state?.folioEditor) {
      if (!save) closeEditorRef.current(false);
      window.history.back();
    } else {
      closeEditorRef.current(save);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get("invite");
    if (!invite) return;
    setInviteCode(invite);
    setShowAccountMenu(true);
    url.searchParams.delete("invite");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // The extension links here with ?connect=extension. Remember the intent across the
  // email sign-in round trip, then generate a device code once signed in.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("connect") === "extension") {
      try { localStorage.setItem(CONNECT_INTENT_KEY, "1"); } catch { /* storage unavailable */ }
      url.searchParams.delete("connect");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    let pending = false;
    try { pending = localStorage.getItem(CONNECT_INTENT_KEY) === "1"; } catch { /* storage unavailable */ }
    if (pending) {
      setConnectIntent(true);
      setShowAccountMenu(true);
    }
  }, []);

  useEffect(() => {
    if (!connectIntent || session !== "signed-in") return;
    try { localStorage.removeItem(CONNECT_INTENT_KEY); } catch { /* storage unavailable */ }
    setConnectIntent(false);
    setShowAccountMenu(true);
    void handleCreateDeviceCode();
    // handleCreateDeviceCode only reads state that is stable at this point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectIntent, session]);

  useEffect(() => {
    const onPopState = () => closeEditorRef.current(true);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!editingNote) return;
    if (noteDraft.trim() === editingNote.content) return;
    setDraftState("pending");
    const timer = window.setTimeout(() => void saveNoteDraft(), 700);
    return () => window.clearTimeout(timer);
    // saveNoteDraft reads the same state this effect depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDraft, editingNote]);

  // Backgrounding the app skips the debounce, so flush as soon as it is hidden.
  const flushNoteDraftRef = useRef(saveNoteDraft);
  flushNoteDraftRef.current = saveNoteDraft;
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") void flushNoteDraftRef.current(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  async function commitDeletion(note: Note) {
    await queueDeletion(workspaceScope, note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    if (workspaceScope === LOCAL_SCOPE) setLocalNoteCount((count) => Math.max(0, count - 1));
    if (session === "signed-in" && navigator.onLine) {
      try {
        await syncFromCloud(workspaceScope);
      } catch {
        setSession("offline");
      }
    }
  }
  commitDeletionRef.current = commitDeletion;

  function flushPendingDelete() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    void commitDeletionRef.current(pending.note);
  }

  flushPendingDeleteRef.current = flushPendingDelete;

  function handleDelete(note: Note) {
    flushPendingDelete();
    if (editor?.kind === "note" && editor.id === note.id) closeEditor(false);
    const timer = window.setTimeout(flushPendingDelete, 5000);
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
      setMessage(t("mergeNeedsNetwork"));
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
      setMessage(t("mergeDone", { count: result.count }));
    } catch {
      setMessage(t("mergeFailed"));
    } finally {
      setMergingLocal(false);
    }
  }

  async function handleCreateDeviceCode() {
    if (creatingDeviceCode) return;
    setCreatingDeviceCode(true);
    try {
      const response = await fetch("/api/auth/device-code", { method: "POST" });
      const data = await response.json().catch(() => ({})) as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.code) {
        setMessage(data.error ?? t("deviceCodeFailed"));
        return;
      }
      setDeviceCode(data.code);
      setDeviceCodeExpiresAt(data.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString());
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
    if (!window.confirm(t("deleteAccountConfirm"))) return;
    if (window.prompt(t("deleteAccountPrompt")) !== "DELETE") return;
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    if (!response.ok) {
      setMessage(t("deleteAccountFailed"));
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
        <h1>{t("storageErrorTitle")}</h1>
        <p>{message}</p>
        <button onClick={() => window.location.reload()}>{t("reopenFolio")}</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><FolioMark /><span>Folio</span></div>
        <div className="top-actions">
          {installPrompt && (
            <button className="install-button" onClick={() => void handleInstall()}>{t("install")}</button>
          )}
          {currentUser && (
            <button
              className="code-button"
              onClick={() => { setShowAccountMenu(true); void handleCreateDeviceCode(); }}
              disabled={creatingDeviceCode || session === "offline"}
              aria-label={t("generateConnectionCode")}
              title={t("generateExtensionCodeTitle")}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1" />
                <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
              </svg>
            </button>
          )}
          <span className={`sync-status ${session}`}>
            <i /> {session === "signed-in" ? t("statusSynced") : session === "signed-out" ? t("statusLocalOnly") : t("statusOffline")}
          </span>
          <button className="more-button" onClick={() => setShowAccountMenu((open) => !open)} aria-label={t("accountSettings")}>•••</button>
          {showAccountMenu && (
            <div className="account-menu">
              {currentUser ? (
                <>
                  <div className="account-email">{currentUser.email}</div>
                  <button onClick={() => void handleCreateDeviceCode()} disabled={creatingDeviceCode || session === "offline"}>
                    {creatingDeviceCode ? t("generating") : t("generateConnectionCode")}
                  </button>
                  {deviceCode && (
                    <DeviceCodeCard
                      code={deviceCode}
                      expiresAt={deviceCodeExpiresAt}
                      refreshing={creatingDeviceCode}
                      onRefresh={() => void handleCreateDeviceCode()}
                    />
                  )}
                  {localNoteCount > 0 && (
                    <button onClick={() => void handleMergeLocalNotes()} disabled={mergingLocal || session === "offline"}>
                      {mergingLocal ? t("merging") : t("mergeLocalNotes", { count: localNoteCount })}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {connectIntent && (
                    <p className="connect-hint" role="status">{t("connectHint")}</p>
                  )}
                  <form className="account-login" onSubmit={handleLogin}>
                    <label htmlFor="email">{t("connectFolioCloud")}</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t("emailPlaceholder")}
                      autoComplete="email"
                    />
                    <input
                      id="invite-code"
                      type="text"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value)}
                      placeholder={t("invitePlaceholder")}
                      autoComplete="one-time-code"
                    />
                    <button disabled={!email.trim() || sendingLogin}>{sendingLogin ? t("sending") : t("sendLoginLink")}</button>
                    {!showWaitlist && (
                      <button type="button" className="waitlist-toggle" onClick={() => setShowWaitlist(true)}>
                        {t("waitlistToggle")}
                      </button>
                    )}
                  </form>
                  {showWaitlist && (waitlistDone ? (
                    <div className="waitlist-done" role="status">{t("waitlistReceived")}</div>
                  ) : (
                    <form className="waitlist-form" onSubmit={handleWaitlist}>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t("emailPlaceholder")}
                        autoComplete="email"
                        aria-label={t("emailPlaceholder")}
                      />
                      <textarea
                        value={waitlistNote}
                        onChange={(event) => setWaitlistNote(event.target.value)}
                        placeholder={t("waitlistNotePlaceholder")}
                        maxLength={280}
                      />
                      <button disabled={!email.trim() || submittingWaitlist}>{submittingWaitlist ? t("submitting") : t("submitRequest")}</button>
                    </form>
                  ))}
                </>
              )}
              <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">{t("installChromeExtension")}</a>
              <button onClick={handleExport}>{t("exportJson")}</button>
              <button onClick={() => setLang(lang === "zh" ? "en" : "zh")}>{t("languageSwitch")}</button>
              <a href="/privacy">{t("privacyAndData")}</a>
              {currentUser && <button onClick={() => void handleLogout()}>{t("menuSignOut")}</button>}
              {currentUser && <button className="danger" onClick={() => void handleDeleteAccount()}>{t("menuDeleteAccount")}</button>}
            </div>
          )}
        </div>
      </header>

      <div className="content-column">
        <section className="intro">
          <p>Every idea matters.</p>
          <h1>{session === "signed-out" ? t("introNewNoteSignedOut") : t("introNewNote")}</h1>
        </section>

        {session === "signed-out" && (
          <aside className="local-notice">
            <div>
              <strong>{t("localNoticeTitle")}</strong>
              <span>{t("localNoticeBody")}</span>
            </div>
            <button onClick={() => setShowAccountMenu(true)}>{t("connectCloud")}</button>
          </aside>
        )}

        {showMergePrompt && localNoteCount > 0 && currentUser && (
          <aside className="merge-notice" role="dialog" aria-label={t("mergeDialogLabel")}>
            <div>
              <strong>{t("mergeFoundTitle", { count: localNoteCount })}</strong>
              <span>{t("mergeFoundBody", { email: currentUser.email })}</span>
            </div>
            <div className="merge-actions">
              <button className="merge-later" onClick={() => setShowMergePrompt(false)}>{t("mergeLater")}</button>
              <button onClick={() => void handleMergeLocalNotes()} disabled={mergingLocal}>
                {mergingLocal ? t("merging") : t("mergeToCloud")}
              </button>
            </div>
          </aside>
        )}

        <section className="composer" aria-label={t("composerLabel")}>
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
              <button className="clear-context" onClick={() => setContext({})} aria-label={t("removeSource")}>×</button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => { setContent(event.target.value); setSaveState("idle"); }}
            placeholder={context.selection ? t("composerPlaceholderSelection") : t("composerPlaceholder")}
            rows={7}
          />

          <footer className="composer-footer">
            <div className="tag-preview">
              {tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
              {!tags.length && <span className="hint">{t("tagHint")}</span>}
            </div>
            <div className="composer-actions">
              <button className="expand-button" onClick={() => openEditor({ kind: "new" })} aria-label={t("fullscreenEdit")} title={t("fullscreenEdit")}>⤢</button>
              <button className={`save-button ${saveState}`} disabled={!canSave || saveState === "saving"} onClick={() => void handleSave()}>
                {saveState === "saving" ? t("saving") : saveState === "saved" ? t("savedCheck") : saveState === "queued" ? t("pendingSyncCheck") : saveState === "local" ? t("savedLocalCheck") : t("save")}
              </button>
            </div>
          </footer>
        </section>

        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")}>×</button></div>}

        <section className="library" aria-label={t("recentNotes")}>
          <div className="library-heading">
            <h2>{t("recent")}</h2>
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
                  aria-label={t("openAndEditNote")}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a, button")) return;
                    if (!window.getSelection()?.toString()) openEditor({ kind: "note", id: note.id });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
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
                    <time>{formatNoteDate(note.updatedAt, new Date(), locale)}</time>
                    {note.url && (
                      <a href={note.url} target="_blank" rel="noreferrer" title={note.title || displayDomain(note.url)}>
                        {note.title || displayDomain(note.url)}
                      </a>
                    )}
                  </div>
                  <div className="note-actions">
                    <button onClick={() => openEditor({ kind: "note", id: note.id })}>{t("edit")}</button>
                    <button onClick={() => handleDelete(note)}>{t("delete")}</button>
                  </div>
                </footer>
              </article>
            ))}
            {!visibleNotes.length && (
              <div className="empty-state">
                <FolioMark />
                <strong>{query || tagFilter ? t("noMatchingNotes") : t("emptyQuiet")}</strong>
                <p>{query || tagFilter ? t("tryAnotherWord") : t("startWithSentence")}</p>
              </div>
            )}
          </div>
        </section>
      </div>
      {pendingDelete && (
        <div className="undo-toast" role="status">
          <span>{t("noteDeleted")}</span>
          <button type="button" onClick={undoDelete}>{t("undo")}</button>
        </div>
      )}
      {editor?.kind === "new" && (
        <NoteEditor
          heading={t("introNewNote")}
          value={content}
          context={context}
          placeholder={context.selection ? t("composerPlaceholderSelection") : t("composerPlaceholder")}
          onChange={(value) => { setContent(value); setSaveState("idle"); }}
          onClose={() => closeEditor()}
          onSubmit={() => { closeEditor(); void handleSave(); }}
          submitLabel={t("save")}
          submitDisabled={!canSave || saveState === "saving"}
        />
      )}
      {editingNote && (
        <NoteEditor
          heading={formatNoteDate(editingNote.createdAt, new Date(), locale)}
          status={draftState === "pending" ? t("saving") : draftState === "empty" ? t("editorStatusEmpty") : t("editorStatusSaved")}
          value={noteDraft}
          context={editingNote}
          placeholder={t("composerPlaceholder")}
          onChange={setNoteDraft}
          onClose={() => closeEditor()}
          onDelete={() => handleDelete(editingNote)}
        />
      )}
    </main>
  );
}
