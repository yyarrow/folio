// UI strings for the web app. Keys are shared; every key must exist in both languages.
const zh = {
  languageSwitch: "English",
} as const;

export type UiKey = keyof typeof zh;

const en: Record<UiKey, string> = {
  languageSwitch: "中文",
};

export const ui: Record<"zh" | "en", Record<UiKey, string>> = { zh, en };
