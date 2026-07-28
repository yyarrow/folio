import { applySyncState, getSyncState } from "./db";
import type { SyncState } from "./types";

const SETTINGS_KEY = "cloud-sync-settings";
const SYNC_URL = "https://folio.warmbeing.com/api/sync";

interface CloudSyncSettings {
  accessCode: string;
}

export class CloudSyncError extends Error {
  constructor(public readonly code: "unauthorized" | "unavailable") {
    super(code);
  }
}

async function readSettings(): Promise<CloudSyncSettings | null> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  const settings = result[SETTINGS_KEY] as CloudSyncSettings | undefined;
  return settings?.accessCode ? settings : null;
}

async function performSync(accessCode: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(SYNC_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessCode}`,
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

export async function connectCloud(accessCode: string): Promise<void> {
  const normalized = accessCode.trim();
  if (!normalized) throw new CloudSyncError("unauthorized");
  await performSync(normalized);
  await browser.storage.local.set({ [SETTINGS_KEY]: { accessCode: normalized } });
}

export async function syncCloud(): Promise<boolean> {
  const settings = await readSettings();
  if (!settings) return false;
  if (!activeSync) {
    activeSync = performSync(settings.accessCode).finally(() => {
      activeSync = null;
    });
  }
  await activeSync;
  return true;
}

export async function disconnectCloud(): Promise<void> {
  await browser.storage.local.remove(SETTINGS_KEY);
}
