"use client";

import { useEffect, useRef } from "react";
import { displayDomain, extractTags } from "@/lib/notes";
import type { PageContext } from "@/lib/types";

interface NoteEditorProps {
  heading: string;
  status?: string;
  value: string;
  context?: PageContext;
  placeholder: string;
  onChange(value: string): void;
  onClose(): void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  onDelete?: () => void;
}

export default function NoteEditor({
  heading,
  status,
  value,
  context,
  placeholder,
  onChange,
  onClose,
  onSubmit,
  submitLabel,
  submitDisabled,
  onDelete,
}: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tags = extractTags(value);
  const characters = Array.from(value.trim()).length;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (onSubmit && !submitDisabled) onSubmit();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onSubmit, submitDisabled]);

  const hasContext = Boolean(context?.url || context?.title || context?.selection);

  return (
    <div className="editor-sheet" role="dialog" aria-modal="true" aria-label={heading}>
      <header className="editor-bar">
        <button className="editor-close" onClick={onClose}>完成</button>
        <div className="editor-title">
          <strong>{heading}</strong>
          {status && <span role="status">{status}</span>}
        </div>
        <div className="editor-actions">
          {onDelete && <button className="editor-delete" onClick={onDelete}>删除</button>}
          {onSubmit && (
            <button className="save-button" disabled={submitDisabled} onClick={onSubmit}>{submitLabel}</button>
          )}
        </div>
      </header>

      <div className="editor-body">
        {hasContext && (
          <div className="editor-context">
            {context?.selection && <blockquote>{context.selection}</blockquote>}
            {context?.url ? (
              <a href={context.url} target="_blank" rel="noreferrer">
                ↗ {context.title || displayDomain(context.url)}
              </a>
            ) : context?.title ? <span>{context.title}</span> : null}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label="笔记内容"
        />
      </div>

      <footer className="editor-footer">
        <div className="tag-preview">
          {tags.slice(0, 6).map((tag) => <span key={tag}>#{tag}</span>)}
          {!tags.length && <span className="hint">可用 #标签</span>}
        </div>
        <span className="editor-count">{characters} 字</span>
      </footer>
    </div>
  );
}
