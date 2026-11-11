import { describe, expect, test } from "bun:test";
import { extractTags, normalizeSharedContext } from "../src/lib/notes";

describe("mobile note helpers", () => {
  test("extracts unique multilingual tags", () => {
    expect(extractTags("今天想到 #产品 #Agent #产品")).toEqual(["产品", "agent"]);
  });

  test("recognizes tags right after CJK text and punctuation", () => {
    expect(extractTags("足够长。#测试 读书，#笔记 学习#读书 （#草稿）")).toEqual([
      "测试",
      "笔记",
      "读书",
      "草稿",
    ]);
    expect(extractTags("#开头 start #tag 中文#标签")).toEqual(["开头", "tag", "标签"]);
  });

  test("does not treat code, URL, entity, or doubled hashes as tags", () => {
    expect(extractTags("C# abc#def https://x.com/a#section x.com/#foo &#123; ##")).toEqual([]);
  });

  test("does not treat Markdown headings as tags", () => {
    expect(extractTags("# Title\n## Subtitle")).toEqual([]);
  });

  test("separates a shared URL from selected text", () => {
    expect(
      normalizeSharedContext({
        title: "一篇文章",
        text: "值得记住的一句话 https://example.com/read",
      }),
    ).toEqual({
      title: "一篇文章",
      url: "https://example.com/read",
      selection: "值得记住的一句话",
    });
  });

  test("keeps a plain shared passage without inventing a URL", () => {
    expect(normalizeSharedContext({ text: "产品要经过需求、生产和销售三个环节" })).toEqual({
      title: undefined,
      url: undefined,
      selection: "产品要经过需求、生产和销售三个环节",
    });
  });

  test("rejects unsafe shared URLs", () => {
    expect(normalizeSharedContext({ url: "javascript:alert(1)", title: "bad" })).toEqual({
      title: "bad",
      url: undefined,
      selection: undefined,
    });
  });
});
