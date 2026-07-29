import { applySyncState, getSyncState } from "./db";
import type { SyncState } from "./types";

const SETTINGS_KEY = "cloud-sync-settings";
const LAST_USER_KEY = "cloud-sync-last-user";
const SYNC_URL = "https://folio.warmbeing.com/api/sync";
const DEVICE_TOKEN_URL = "https://folio.warmbeing.com/api/auth/device-token";

interface CloudSyncSettings {
  deviceToken: string;
  userId: string;
}

export class CloudSyncError extends Error {
  constructor(public readonly code: "unauthorized" | "unavailable" | "account-mismatch") {
    super(code);
  }
}

async function readSettings(): Promise<CloudSyncSettings | null> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  const settings = result[SETTINGS_KEY] as CloudSyncSettings | undefined;
  if (settings?.deviceToken && settings.userId) return settings;
  if (settings) await browser.storage.local.remove(SETTINGS_KEY);
  return null;
}

async function performSync(deviceToken: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(SYNC_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${deviceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(await getSyncState()),
      cache: "no-store",
    });
  } catch {
    throw new CloudSyncError("unavailable");
  }

  if (response.status === 401) throw new CloudSyncError("unauthorized");
  if (!response.ok) throw new CloudSyncError("unavailable");
  const state = await response.json() as SyncState;
  if (!Array.isArray(state.notes) || !Array.isArray(state.deletions)) {
    throw new CloudSyncError("unavailable");
  }
  await applySyncState(state);
}

let activeSync: Promise<void> | null = null;

export async function isCloudConnected(): Promise<boolean> {
  return Boolean(await readSettings());
}

export async function connectCloud(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new CloudSyncError("unauthorized");
  let response: Response;
  try {
    response = await fetch(DEVICE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: normalized }),
      cache: "no-store",
    });
  } catch {
    throw new CloudSyncError("unavailable");
  }
  if (response.status === 401) throw new CloudSyncError("unauthorized");
  if (!response.ok) throw new CloudSyncError("unavailable");
  const result = await response.json() as { token?: unknown; userId?: unknown };
  if (typeof result.token !== "string" || typeof result.userId !== "string") {
    throw new CloudSyncError("unavailable");
  }

  const previous = await browser.storage.local.get(LAST_USER_KEY);
  const previousUserId = previous[LAST_USER_KEY];
  if (typeof previousUserId === "string" && previousUserId !== result.userId) {
    await fetch(DEVICE_TOKEN_URL, {
      method: "DELETE",
      headers: { "authorization": `Bearer ${result.token}` },
    }).catch(() => undefined);
    throw new CloudSyncError("account-mismatch");
  }

  await performSync(result.token);
  await browser.storage.local.set({
    [SETTINGS_KEY]: { deviceToken: result.token, userId: result.userId },
    [LAST_USER_KEY]: result.userId,
  });
}

export async function syncCloud(): Promise<boolean> {
  const settings = await readSettings();
  if (!settings) return false;
  if (!activeSync) {
    activeSync = performSync(settings.deviceToken).finally(() => {
      activeSync = null;
    });
  }
  await activeSync;
  return true;
}

export async function disconnectCloud(): Promise<void> {
  const settings = await readSettings();
  if (settings) {
    await fetch(DEVICE_TOKEN_URL, {
      method: "DELETE",
      headers: { "authorization": `Bearer ${settings.deviceToken}` },
    }).catch(() => undefined);
  }
  await browser.storage.local.remove(SETTINGS_KEY);
}
