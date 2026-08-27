import { describe, expect, it } from "vitest";
import { messageKeys } from "../lib/i18n";
import en from "../public/_locales/en/messages.json";
import zhCN from "../public/_locales/zh_CN/messages.json";

describe("extension localization", () => {
  it("keeps English and Simplified Chinese catalogs complete and aligned", () => {
    const expected = [...messageKeys].sort();
    expect(Object.keys(en).sort()).toEqual(expected);
    expect(Object.keys(zhCN).sort()).toEqual(expected);
  });

  it("provides non-empty translated messages", () => {
    for (const key of messageKeys) {
      expect(en[key].message.trim()).not.toBe("");
      expect(zhCN[key].message.trim()).not.toBe("");
    }
  });
});
