"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "waiting" | "invited" | "joined";
interface Entry {
  email: string;
  note: string | null;
  createdAt: string;
  invitedAt: string | null;
  status: Status;
}

const STATUS_LABEL: Record<Status, string> = { waiting: "等待中", invited: "已邀请", joined: "已加入" };

export default function AdminPage() {
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
        setErrors((current) => ({ ...current, [email]: data.error ?? "发送失败。" }));
        return;
      }
      await load();
    } catch {
      setErrors((current) => ({ ...current, [email]: "网络错误，请重试。" }));
    } finally {
      setSending((current) => ({ ...current, [email]: false }));
    }
  }

  if (state === "missing") {
    return <main className="admin-page"><p className="admin-empty">页面不存在</p></main>;
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <h1>等候名单</h1>
        <a href="/">返回 Folio</a>
      </header>
      {state === "loading" && <p className="admin-empty">加载中…</p>}
      {state === "error" && <p className="admin-empty">加载失败，请刷新重试。</p>}
      {state === "ready" && entries.length === 0 && <p className="admin-empty">还没有人申请。</p>}
      {state === "ready" && entries.length > 0 && (
        <ul className="admin-list">
          {entries.map((entry) => (
            <li key={entry.email} className="admin-row">
              <div className="admin-main">
                <strong>{entry.email}</strong>
                {entry.note && <p>{entry.note}</p>}
                <small>
                  申请于 {new Date(entry.createdAt).toLocaleString("zh-CN")}
                  {entry.invitedAt && ` · 邀请于 ${new Date(entry.invitedAt).toLocaleString("zh-CN")}`}
                </small>
                {errors[entry.email] && <small className="admin-error">{errors[entry.email]}</small>}
              </div>
              <span className={`admin-badge ${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
              {entry.status !== "joined" && (
                <button className="admin-button" disabled={sending[entry.email]} onClick={() => void invite(entry.email)}>
                  {sending[entry.email] ? "发送中…" : entry.status === "invited" ? "重新发送" : "发送邀请"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
