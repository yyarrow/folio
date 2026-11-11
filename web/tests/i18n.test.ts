import { describe, expect, test } from "bun:test";
import { format, pickLang } from "@/lib/i18n";
import { ui } from "@/lib/messages";
import { serverMessages } from "@/lib/server-messages";

describe("pickLang", () => {
  test("prefers an explicit cookie", () => {
    expect(pickLang("zh-CN,zh;q=0.9", "en")).toBe("en");
    expect(pickLang("en-US", "zh")).toBe("zh");
  });
  test("uses the highest-weighted Accept-Language entry", () => {
    expect(pickLang("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(pickLang("zh-TW")).toBe("zh");
    expect(pickLang("en-US,en;q=0.9,zh;q=0.8")).toBe("en");
    expect(pickLang("en;q=0.5,zh-CN;q=0.9")).toBe("zh");
    expect(pickLang("fr-FR")).toBe("en");
  });
  test("falls back to Chinese without a header", () => {
    expect(pickLang(null)).toBe("zh");
    expect(pickLang("")).toBe("zh");
  });
});

test("format replaces placeholders", () => {
  expect(format("{n} 条", { n: 3 })).toBe("3 条");
  expect(format("keep {missing}")).toBe("keep {missing}");
});

test("both languages define the same non-empty keys", () => {
  for (const table of [ui, serverMessages]) {
    expect(Object.keys(table.en).sort()).toEqual(Object.keys(table.zh).sort());
  }
  for (const value of Object.values(ui.en)) expect(value.length).toBeGreaterThan(0);
});
