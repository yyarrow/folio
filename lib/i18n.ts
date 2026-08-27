export const messageKeys = [
  "extensionName",
  "extensionDescription",
  "openFolio",
  "syncComplete",
  "syncConnectionExpired",
  "syncUnavailableLocal",
  "deleteConfirm",
  "connectedSynced",
  "codeInvalidExpired",
  "accountMismatch",
  "cloudUnavailable",
  "disconnectedLocal",
  "syncStatusLocal",
  "syncStatusSyncing",
  "syncStatusSynced",
  "syncStatusOffline",
  "syncStatusError",
  "moreOptions",
  "syncNow",
  "disconnectCloud",
  "connectCloud",
  "deviceCodePlaceholder",
  "connecting",
  "connectAndSync",
  "exportMarkdown",
  "exportJson",
  "newNote",
  "editNote",
  "captureMoment",
  "cancel",
  "composerPlaceholder",
  "tagHint",
  "saving",
  "saved",
  "save",
  "notes",
  "recent",
  "searchPlaceholder",
  "clearSearch",
  "edit",
  "delete",
  "noMatchingNotes",
  "noNotes",
  "tryDifferentSearch",
  "emptyNotesDescription",
  "exportNoComment",
  "exportSource",
  "exportedAt",
] as const;

export type MessageKey = (typeof messageKeys)[number];

export function t(key: MessageKey, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key, substitutions) || key;
}

export function getUILanguage(): string {
  return browser.i18n.getUILanguage() || navigator.language || "en";
}
