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
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState("");
  const [copied, setCopied] = useState(false);

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
        body: JSON.stringify({ email }),
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
    setCopied(false);
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

  async function copyGenerated() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
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
        <h1>{t("adminInviteEmailTitle")}</h1>
        <a href="/">{t("backToFolio")}</a>
      </header>
      <form className="admin-form" onSubmit={(event) => void inviteDirect(event)}>
        <input
          className="admin-input"
          type="email"
          required
          value={inviteEmail}
          placeholder={t("adminInviteEmailPlaceholder")}
          onChange={(event) => setInviteEmail(event.target.value)}
        />
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
        {generateError && <p className="admin-note admin-error">{generateError}</p>}
        {generated && (
          <div className="admin-code">
            <strong>{generated}</strong>
            <button type="button" className="code-button" aria-label={t("adminCopyCode")} title={t("adminCopyCode")} onClick={() => void copyGenerated()}>
              {copied ? "✓" : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
              )}
            </button>
            <span>{t("adminGenerateNote")}</span>
          </div>
        )}
      </div>

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
      <h2 className="admin-section">{t("adminHistoryTitle")}</h2>
      {invites.length === 0 ? (
        <p className="admin-empty admin-empty-compact">{t("adminHistoryEmpty")}</p>
      ) : (
        <ul className="admin-list">
          {invites.map((invite) => (
            <li key={invite.id} className="admin-row admin-row-compact">
              <span className={`admin-badge ${invite.kind}`}>{t(invite.kind === "generic" ? "adminKindGeneric" : "adminKindEmail")}</span>
              <div className="admin-main">
                <strong>{invite.email ?? "—"}</strong>
                <small>{t("adminCreatedAt", { date: new Date(invite.createdAt).toLocaleDateString(locale) })}</small>
              </div>
              <span className={`admin-badge status-${invite.status}`}>{t(INVITE_STATUS_LABEL[invite.status])}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
