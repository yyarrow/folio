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

const STATUS_LABEL: Record<Status, UiKey> = { waiting: "adminStatusWaiting", invited: "adminStatusInvited", joined: "adminStatusJoined" };

export default function AdminPage() {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en";
  const [state, setState] = useState<"loading" | "missing" | "error" | "ready">("loading");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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
  }, [load]);

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
        <h1>{t("waitlist")}</h1>
        <a href="/">{t("backToFolio")}</a>
      </header>
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
