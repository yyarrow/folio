"use client";

import { useCallback, useEffect, useState } from "react";
import type { UiKey } from "@/lib/messages";
import { useI18n } from "../i18n-provider";

type Status = "waiting" | "invited" | "joined";
interface Entry {
  email: string;
  note: string | null;
  createdAt: string;
  invitedAt: string | null;
  status: Status;
}

interface InviteRow {
  id: string;
  code: string | null;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: "unused" | "used" | "expired";
  kind: "generic" | "email";
}

const INVITE_STATUS_LABEL: Record<InviteRow["status"], UiKey> = { unused: "adminInviteUnused", used: "adminInviteUsed", expired: "adminInviteExpired" };

const STATUS_LABEL: Record<Status, UiKey> = { waiting: "adminStatusWaiting", invited: "adminStatusInvited", joined: "adminStatusJoined" };

export default function AdminPage() {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en";
  const [state, setState] = useState<"loading" | "missing" | "error" | "ready">("loading");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState(() => t("adminInviteMessageDefault"));
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/invites", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { invites: InviteRow[] };
      setInvites(data.invites);
    } catch {
      // History is best-effort.
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/waitlist", { cache: "no-store" });
      if (response.status === 404) return setState("missing");
      if (!response.ok) return setState("error");
      const data = await response.json() as { entries: Entry[] };
      setEntries(data.entries);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    void loadInvites();
  }, [load, loadInvites]);

  async function inviteDirect(event: React.FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, message: inviteNote }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setInviteMessage({ text: data.error ?? t("adminSendFailed"), error: true });
        return;
      }
      setInviteMessage({ text: t("adminInviteSent", { email: email.toLowerCase() }), error: false });
      setInviteEmail("");
      await Promise.all([load(), loadInvites()]);
    } catch {
      setInviteMessage({ text: t("networkRetry"), error: true });
    } finally {
      setInviteBusy(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setGenerateError("");
    try {
      const response = await fetch("/api/admin/invites/generic", { method: "POST" });
      const data = await response.json().catch(() => ({})) as { code?: string; error?: string };
      if (!response.ok || !data.code) {
        setGenerateError(data.error ?? t("adminSendFailed"));
        return;
      }
      setGenerated(data.code);
      await loadInvites();
    } catch {
      setGenerateError(t("networkRetry"));
    } finally {
      setGenerating(false);
    }
  }

  // Email invites sign the recipient straight in; generic codes still need an email.
  function inviteLink(invite: InviteRow & { code: string }): string {
    const code = encodeURIComponent(invite.code);
    return invite.kind === "email"
      ? `${window.location.origin}/api/auth/accept-invite?code=${code}`
      : `${window.location.origin}/?invite=${code}`;
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      // Clipboard unavailable; the code is selectable on screen.
    }
  }

  async function invite(email: string) {
    setSending((current) => ({ ...current, [email]: true }));
    setErrors((current) => ({ ...current, [email]: "" }));
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setErrors((current) => ({ ...current, [email]: data.error ?? t("adminSendFailed") }));
        return;
      }
      await load();
    } catch {
      setErrors((current) => ({ ...current, [email]: t("networkRetry") }));
    } finally {
      setSending((current) => ({ ...current, [email]: false }));
    }
  }

  if (state === "missing") {
    return <main className="admin-page"><p className="admin-empty">{t("adminNotFound")}</p></main>;
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <h1>{t("adminTitle")}</h1>
        <a href="/">{t("backToFolio")}</a>
      </header>
      <h2 className="admin-section">{t("adminInviteEmailTitle")}</h2>
      <form className="admin-invite-form" onSubmit={(event) => void inviteDirect(event)}>
        <input
          className="admin-input"
          type="email"
          required
          value={inviteEmail}
          placeholder={t("adminInviteEmailPlaceholder")}
          onChange={(event) => setInviteEmail(event.target.value)}
        />
        <div className="admin-message-label">
          <label htmlFor="invite-message">{t("adminInviteMessageLabel")}</label>
          {inviteNote !== t("adminInviteMessageDefault") && (
            <button type="button" className="admin-link-button" onClick={() => setInviteNote(t("adminInviteMessageDefault"))}>
              {t("adminInviteMessageReset")}
            </button>
          )}
        </div>
        <textarea
          id="invite-message"
          className="admin-textarea"
          value={inviteNote}
          maxLength={2000}
          rows={7}
          onChange={(event) => setInviteNote(event.target.value)}
        />
        <p className="admin-note admin-hint">{t("adminInviteMessageHint")}</p>
        <button className="admin-button" type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
          {inviteBusy ? t("sending") : t("adminSendInvite")}
        </button>
      </form>
      {inviteMessage && <p className={inviteMessage.error ? "admin-note admin-error" : "admin-note"}>{inviteMessage.text}</p>}

      <h2 className="admin-section">{t("adminGenerateTitle")}</h2>
      <div className="admin-generate">
        <button className="admin-button" disabled={generating} onClick={() => void generate()}>
          {generating ? t("adminGenerating") : t("adminGenerate")}
        </button>
        <p className="admin-note">{t("adminGenerateNote")}</p>
        {generateError && <p className="admin-note admin-error">{generateError}</p>}
      </div>

      <h2 className="admin-section">{t("adminHistoryTitle")}</h2>
      {invites.length === 0 ? (
        <p className="admin-empty admin-empty-compact">{t("adminHistoryEmpty")}</p>
      ) : (
        <ul className="admin-list">
          {invites.map((invite) => (
            <li key={invite.id} className={`admin-row admin-row-compact${invite.code && invite.code === generated ? " admin-row-new" : ""}`}>
              <span className={`admin-badge ${invite.kind}`}>{t(invite.kind === "generic" ? "adminKindGeneric" : "adminKindEmail")}</span>
              <div className="admin-main">
                {invite.code ? (
                  <code className="admin-invite-code">{invite.code}</code>
                ) : invite.status === "unused" ? (
                  <small>{t("adminLegacyCode")}</small>
                ) : null}
                <strong>{invite.email ?? (invite.kind === "generic" ? t("adminAnyEmail") : "—")}</strong>
                <small>{t("adminCreatedAt", { date: new Date(invite.createdAt).toLocaleDateString(locale) })}</small>
              </div>
              <span className={`admin-badge status-${invite.status}`}>{t(INVITE_STATUS_LABEL[invite.status])}</span>
              {invite.code && (
                <div className="admin-copy-actions">
                  <button type="button" className="admin-copy" onClick={() => void copy(invite.code!, `${invite.id}:code`)}>
                    {copied === `${invite.id}:code` ? t("adminCopied") : t("adminCopyCode")}
                  </button>
                  <button type="button" className="admin-copy" onClick={() => void copy(inviteLink({ ...invite, code: invite.code! }), `${invite.id}:link`)}>
                    {copied === `${invite.id}:link` ? t("adminCopied") : t("adminCopyLink")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="admin-section">{t("waitlist")}</h2>
      {state === "loading" && <p className="admin-empty">{t("loading")}</p>}
      {state === "error" && <p className="admin-empty">{t("adminLoadFailed")}</p>}
      {state === "ready" && entries.length === 0 && <p className="admin-empty">{t("adminEmpty")}</p>}
      {state === "ready" && entries.length > 0 && (
        <ul className="admin-list">
          {entries.map((entry) => (
            <li key={entry.email} className="admin-row">
              <div className="admin-main">
                <strong>{entry.email}</strong>
                {entry.note && <p>{entry.note}</p>}
                <small>
                  {t("adminRequestedAt", { date: new Date(entry.createdAt).toLocaleString(locale) })}
                  {entry.invitedAt && t("adminInvitedAt", { date: new Date(entry.invitedAt).toLocaleString(locale) })}
                </small>
                {errors[entry.email] && <small className="admin-error">{errors[entry.email]}</small>}
              </div>
              <span className={`admin-badge ${entry.status}`}>{t(STATUS_LABEL[entry.status])}</span>
              {entry.status !== "joined" && (
                <button className="admin-button" disabled={sending[entry.email]} onClick={() => void invite(entry.email)}>
                  {sending[entry.email] ? t("sending") : entry.status === "invited" ? t("adminResend") : t("adminSendInvite")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
