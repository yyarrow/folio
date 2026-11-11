import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown, type MarkdownOptions } from "@/lib/markdown";

function html(source: string, options?: MarkdownOptions): string {
  return renderToStaticMarkup(<>{renderMarkdown(source, options)}</>);
}

describe("renderMarkdown blocks", () => {
  test("empty input returns null", () => {
    expect(renderMarkdown("")).toBeNull();
    expect(renderMarkdown("  \n\n ")).toBeNull();
  });

  test("headings use md-h paragraphs", () => {
    expect(html("# One")).toBe('<p class="md-h md-h1">One</p>');
    expect(html("###### Six")).toBe('<p class="md-h md-h6">Six</p>');
  });

  test("heading is not a tag, but #tag without space is", () => {
    expect(html("# Heading")).not.toContain("md-tag");
    expect(html("#Heading")).toContain('<span class="md-tag">#Heading</span>');
  });

  test("unordered lists merge consecutive items", () => {
    expect(html("- a\n* b\n+ c")).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
  });

  test("ordered lists", () => {
    expect(html("1. a\n2) b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  test("blockquote keeps line breaks and inline content", () => {
    expect(html("> a **b**\n> c")).toBe("<blockquote>a <strong>b</strong><br/>c</blockquote>");
  });

  test("fenced code is literal", () => {
    const out = html("```\n**x** #tag <b>\n```");
    expect(out).toBe("<pre><code>**x** #tag &lt;b&gt;</code></pre>");
    expect(out).not.toContain("<strong>");
    expect(out).not.toContain("md-tag");
  });

  test("horizontal rules", () => {
    for (const rule of ["---", "***", "___"]) expect(html(rule)).toBe("<hr/>");
  });

  test("paragraphs split on blank lines, single newlines become br", () => {
    expect(html("a\nb\n\nc")).toBe("<p>a<br/>b</p><p>c</p>");
  });
});

describe("renderMarkdown inline", () => {
  test("code is literal", () => {
    expect(html("`**a** #b`")).toBe("<p><code>**a** #b</code></p>");
  });

  test("bold, italic, strike", () => {
    expect(html("**a** __b__ *c* _d_ ~~e~~")).toBe(
      "<p><strong>a</strong> <strong>b</strong> <em>c</em> <em>d</em> <del>e</del></p>",
    );
  });

  test("underscores inside words are not emphasis", () => {
    const out = html("snake_case_name");
    expect(out).not.toContain("<em>");
    expect(out).toContain("snake_case_name");
  });

  test("unclosed markers stay literal", () => {
    expect(html("**a and `b and [c")).toBe("<p>**a and `b and [c</p>");
  });

  test("safe links", () => {
    expect(html("[x](https://example.com/a)")).toBe(
      '<p><a href="https://example.com/a" target="_blank" rel="noreferrer noopener">x</a></p>',
    );
    expect(html("[m](mailto:a@b.co)")).toContain('href="mailto:a@b.co"');
  });

  test("unsafe link protocols render literally", () => {
    const out = html("[x](javascript:alert(1))");
    expect(out).not.toContain("<a");
    expect(out).toContain("[x]");
  });

  test("autolinks trim trailing punctuation", () => {
    expect(html("see https://example.com/a.")).toBe(
      '<p>see <a href="https://example.com/a" target="_blank" rel="noreferrer noopener">https://example.com/a</a>.</p>',
    );
    expect(html("(http://a.co/x)，好")).toContain('href="http://a.co/x"');
  });

  test("tags are not detected inside link urls", () => {
    const out = html("https://example.com/#frag and [t](https://e.com/#x)");
    expect(out).not.toContain("md-tag");
  });

  test("tags render as spans, or buttons with a click handler", () => {
    expect(html("a #Foo")).toBe('<p>a <span class="md-tag">#Foo</span></p>');
    const out = html("a #Foo", { onTagClick: () => {} });
    expect(out).toContain('<button type="button" class="md-tag">#Foo</button>');
  });

  test("tag after CJK punctuation", () => {
    expect(html("读书，#笔记")).toContain('<span class="md-tag">#笔记</span>');
  });

  test("tag click lowercases and stops propagation", () => {
    const calls: string[] = [];
    const tree = renderMarkdown("#Foo", { onTagClick: (t) => calls.push(t) });
    type Props = { onClick?: (e: unknown) => void; children?: unknown };
    const find = (node: unknown): { props: Props } | null => {
      if (Array.isArray(node)) {
        for (const child of node) {
          const hit = find(child);
          if (hit) return hit;
        }
        return null;
      }
      if (node && typeof node === "object" && "props" in node) {
        const el = node as { type: unknown; props: Props };
        return el.type === "button" ? el : find(el.props.children);
      }
      return null;
    };
    const button = find(tree)!;
    let stopped = false;
    button.props.onClick!({ stopPropagation: () => (stopped = true) });
    expect(calls).toEqual(["foo"]);
    expect(stopped).toBe(true);
  });
});

describe("renderMarkdown safety and performance", () => {
  test("raw html is escaped", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("20k char notes render quickly, even with pathological markers", () => {
    const inputs = ["*a ".repeat(7000), "[a".repeat(10000), "_x ".repeat(7000), "**a\n".repeat(5000), "word #tag `c` **b** ".repeat(1000)];
    for (const input of inputs) {
      const start = performance.now();
      html(input);
      expect(performance.now() - start).toBeLessThan(500);
    }
    const start = performance.now();
    renderMarkdown("word #tag `c` **b** ".repeat(1000));
    expect(performance.now() - start).toBeLessThan(50);
  });
});
