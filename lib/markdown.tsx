import { Fragment, type ReactNode } from "react";

export interface MarkdownOptions {
  onTagClick?: (tag: string) => void;
}

const TAG_SOURCE = String.raw`(?<![\p{Script=Latin}\p{N}_&/#])#([\p{L}\p{N}_-]+)`;
// Sticky variant of the shared tag rule so we can test a single position.
const TAG_AT = new RegExp(TAG_SOURCE, "guy");
const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
const TRAILING_PUNCT = new Set([..."., ;:!?)。，；：！？）」"].filter((ch) => ch !== " "));
// A bare URL ends at whitespace, angle brackets, fullwidth punctuation or CJK text.
const URL_END = /[\s<>。，；：！？）（」「、\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return SAFE_PROTOCOLS.has(url.protocol) ? raw : null;
  } catch {
    return null;
  }
}

interface InlineContext {
  options: MarkdownOptions;
  noLink: boolean;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && ch !== "" && (WORD.test(ch) || ch === "_");
}

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || ch === "" || SPACE.test(ch);
}

function parseInline(text: string, ctx: InlineContext): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;
  let plainStart = 0;
  // Remembers the start index from which a marker is known to have no closer,
  // so repeated unclosed markers don't rescan the text (keeps parsing linear-ish).
  const noCloser = new Map<string, number>();
  let noBracket = false;

  const flush = (end: number) => {
    if (end > plainStart) out.push(text.slice(plainStart, end));
  };

  const findCloser = (marker: string, from: number): number => {
    const failed = noCloser.get(marker);
    if (failed !== undefined && from >= failed) return -1;
    const single = marker.length === 1;
    let pos = from;
    while (true) {
      const idx = text.indexOf(marker, pos);
      if (idx === -1) break;
      const before = text[idx - 1];
      const after = text[idx + marker.length];
      let ok = idx > from && !isSpace(before);
      if (ok && single && (before === marker || after === marker)) ok = false;
      if (ok && marker[0] === "_" && isWordChar(after)) ok = false;
      if (ok) return idx;
      pos = idx + (single && after === marker ? 2 : 1);
    }
    noCloser.set(marker, from);
    return -1;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const prev = text[i - 1];

    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush(i);
        out.push(<code key={key++}>{text.slice(i + 1, end)}</code>);
        i = plainStart = end + 1;
        continue;
      }
    } else if (c === "*" || c === "_" || c === "~") {
      const double = text[i + 1] === c;
      const marker = double ? c + c : c;
      const contentStart = i + marker.length;
      const canOpen =
        !isSpace(text[contentStart]) && (c !== "_" || !isWordChar(prev)) && (c !== "~" || double);
      if (canOpen) {
        const close = findCloser(marker, contentStart);
        if (close !== -1) {
          flush(i);
          const inner = parseInline(text.slice(contentStart, close), ctx);
          if (marker === "**" || marker === "__") out.push(<strong key={key++}>{inner}</strong>);
          else if (marker === "~~") out.push(<del key={key++}>{inner}</del>);
          else out.push(<em key={key++}>{inner}</em>);
          i = plainStart = close + marker.length;
          continue;
        }
      }
      // Literal marker run: skip the whole double marker so it isn't re-read as a single.
      i += double ? 2 : 1;
      continue;
    } else if (c === "[" && !ctx.noLink && !noBracket) {
      const close = text.indexOf("]", i + 1);
      if (close === -1) noBracket = true;
      else if (text[close + 1] === "(") {
        const paren = text.indexOf(")", close + 2);
        if (paren !== -1) {
          const href = safeUrl(text.slice(close + 2, paren).trim());
          if (href) {
            flush(i);
            const label = parseInline(text.slice(i + 1, close), { ...ctx, noLink: true });
            out.push(
              <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
                {label}
              </a>,
            );
            i = plainStart = paren + 1;
            continue;
          }
        }
      }
    } else if (c === "h" && !ctx.noLink && !isWordChar(prev) && /^https?:\/\//.test(text.slice(i, i + 8))) {
      let end = i;
      while (end < text.length && !URL_END.test(text[end]!)) end++;
      while (end > i && TRAILING_PUNCT.has(text[end - 1]!)) end--;
      const raw = text.slice(i, end);
      const href = raw.length > 8 ? safeUrl(raw) : null;
      if (href) {
        flush(i);
        out.push(
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
            {raw}
          </a>,
        );
        i = plainStart = end;
        continue;
      }
    } else if (c === "#") {
      TAG_AT.lastIndex = i;
      const m = TAG_AT.exec(text);
      if (m) {
        flush(i);
        const tag = m[1]!;
        const { onTagClick } = ctx.options;
        out.push(
          onTagClick ? (
            <button
              key={key++}
              type="button"
              className="md-tag"
              onClick={(event) => {
                event.stopPropagation();
                onTagClick(tag.toLocaleLowerCase());
              }}
            >
              {"#" + tag}
            </button>
          ) : (
            <span key={key++} className="md-tag">
              {"#" + tag}
            </span>
          ),
        );
        i = plainStart = i + m[0].length;
        continue;
      }
    }
    i++;
  }
  flush(text.length);
  return out;
}

function renderLines(lines: string[], ctx: InlineContext): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push(<br key={`b${idx}`} />);
    out.push(<Fragment key={`l${idx}`}>{parseInline(line, ctx)}</Fragment>);
  });
  return out;
}

const FENCE = /^\s{0,3}```/;
const FENCE_END = /^\s*```\s*$/;
const HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HR.test(line) || HEADING.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line);
}

export function renderMarkdown(source: string, options: MarkdownOptions = {}): ReactNode {
  if (!source || !source.trim()) return null;
  const ctx: InlineContext = { options, noLink: false };
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let n = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;

    if (!line.trim()) {
      i++;
    } else if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE_END.test(lines[i]!)) code.push(lines[i++]!);
      i++; // closing fence (or EOF)
      blocks.push(
        <pre key={n++}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
    } else if (HR.test(line)) {
      blocks.push(<hr key={n++} />);
      i++;
    } else if ((m = HEADING.exec(line))) {
      const level = m[1]!.length;
      blocks.push(
        <p key={n++} className={`md-h md-h${level}`}>
          {parseInline(m[2]!, ctx)}
        </p>,
      );
      i++;
    } else if (UL.test(line) || OL.test(line)) {
      const ordered = !UL.test(line);
      const re = ordered ? OL : UL;
      const start = ordered ? Number(OL.exec(line)![1]) : 1;
      const items: ReactNode[] = [];
      while (i < lines.length && !HR.test(lines[i]!) && (m = re.exec(lines[i]!))) {
        items.push(<li key={items.length}>{parseInline(m[ordered ? 2 : 1]!, ctx)}</li>);
        i++;
      }
      blocks.push(
        ordered ? (
          <ol key={n++} start={start !== 1 ? start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={n++}>{items}</ul>
        ),
      );
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && (m = QUOTE.exec(lines[i]!))) {
        quoted.push(m[1]!);
        i++;
      }
      blocks.push(<blockquote key={n++}>{renderLines(quoted, ctx)}</blockquote>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() && (para.length === 0 || !startsBlock(lines[i]!))) {
        para.push(lines[i]!.trim());
        i++;
      }
      blocks.push(<p key={n++}>{renderLines(para, ctx)}</p>);
    }
  }

  return blocks.length ? blocks : null;
}
