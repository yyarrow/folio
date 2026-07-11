import type { PageContext } from "./types";

const DRAFT_KEY = "composer-draft";

export interface ComposerDraft {
  content: string;
  context: PageContext;
  editingId: string | null;
  updatedAt: string;
}

export async function loadDraft(): Promise<ComposerDraft | null> {
  const result = await browser.storage.local.get(DRAFT_KEY);
  const draft = result[DRAFT_KEY] as ComposerDraft | undefined;
  return draft?.content?.trim() || draft?.editingId ? draft : null;
}

export async function persistDraft(draft: ComposerDraft): Promise<void> {
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
}

export async function clearDraft(): Promise<void> {
  await browser.storage.local.remove(DRAFT_KEY);
}
