"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./i18n-provider";

interface DeviceCodeCardProps {
  code: string;
  expiresAt: string;
  refreshing: boolean;
  onRefresh(): void;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function DeviceCodeCard({ code, expiresAt, refreshing, onRefresh }: DeviceCodeCardProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const remaining = new Date(expiresAt).getTime() - now;
  const expired = remaining <= 0;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`device-code${expired ? " expired" : ""}`} role="status">
      <strong>{code}</strong>
      <span>{expired ? t("deviceCodeExpired") : t("deviceCodeEnter", { time: formatRemaining(remaining) })}</span>
      <div className="device-code-actions">
        <button onClick={() => void handleCopy()} disabled={expired} aria-label={t("copyConnectionCode")} title={t("copy")}>
          {copied ? (
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="7" y="7" width="9" height="9" rx="2" />
              <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
            </svg>
          )}
        </button>
        <button onClick={onRefresh} disabled={refreshing} aria-label={t("regenerateConnectionCode")} title={t("regenerate")}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className={refreshing ? "spinning" : undefined}>
            <path d="M15.5 9.5A5.5 5.5 0 1 1 13.9 5.6" />
            <path d="M14.5 2.5v3.5H11" />
          </svg>
        </button>
      </div>
    </div>
  );
}
