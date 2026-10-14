"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { Diagnostic, Frame } from "@/lib/dsl/types";

const LH = 22;
const PAD = 16;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function value(v: string): string {
  const t = v.trim();
  if (t === "-" || /^(off|no|ninguno)$/i.test(t)) return `<span class="tk-off">${esc(v)}</span>`;
  return esc(v).replace(/("[^"]*"|'[^']*')/g, '<span class="tk-str">$1</span>');
}

export function highlightLine(line: string): string {
  const t = line.trim();
  if (!t) return "";
  if (t.startsWith("#") || t.startsWith("//")) return `<span class="tk-c">${esc(line)}</span>`;
  if (t.startsWith("==")) return `<span class="tk-scene">${esc(line)}</span>`;
  let m = line.match(/^(\s*)(@\S+)(.*)$/);
  if (m) return `${m[1]}<span class="tk-at">${esc(m[2])}</span>${value(m[3])}`;
  m = line.match(/^(\s*)>(.*)$/);
  if (m) {
    let rest = m[2];
    let opt = "";
    const om = rest.match(/\{[^}]*\}\s*$/);
    if (om) {
      opt = om[0];
      rest = rest.slice(0, om.index);
    }
    let sub = "";
    const p = rest.indexOf("|");
    if (p >= 0) {
      sub = rest.slice(p);
      rest = rest.slice(0, p);
    }
    return `${m[1]}<span class="tk-gt">&gt;</span><span class="tk-nar">${esc(rest).replace(/\[[^\]]*\]/g, (x) => `<span class="tk-tag">${x}</span>`)}</span>${
      sub ? `<span class="tk-sub">${esc(sub)}</span>` : ""
    }${opt ? `<span class="tk-opt">${esc(opt)}</span>` : ""}`;
  }
  m = line.match(/^(\s*)(sujeto|pose|extra|estilo)(\s+)([^\s:"']+)(.*)$/i);
  if (m) return `${m[1]}<span class="tk-kw">${m[2]}</span>${m[3]}<span class="tk-id">${esc(m[4])}</span>${value(m[5])}`;
  if (/^\s*(limpiar|reset)\s*$/i.test(line)) return `<span class="tk-kw">${esc(line)}</span>`;
  m = line.match(/^(\s*)([^:"]+)(:)(.*)$/);
  if (m) return `${m[1]}<span class="tk-key">${esc(m[2])}</span><span class="tk-off">:</span>${value(m[4])}`;
  return esc(line);
}

export interface EditorHandle {
  revealLine: (line: number) => void;
  insert: (text: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onCursorLine: (line: number) => void;
  diagnostics: Diagnostic[];
  frames: Frame[];
  activeLine: number | null;
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { value: src, onChange, onCursorLine, diagnostics, frames, activeLine },
  ref,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => src.split("\n"), [src]);
  const html = useMemo(() => lines.map((l) => highlightLine(l) || " ").join("\n"), [lines]);
  const diagByLine = useMemo(() => {
    const m = new Map<number, Diagnostic>();
    for (const d of diagnostics) {
      const prev = m.get(d.line);
      if (!prev || (d.level === "error" && prev.level !== "error")) m.set(d.line, d);
    }
    return m;
  }, [diagnostics]);
  const frameByLine = useMemo(() => new Map(frames.map((f) => [f.line, f.index + 1])), [frames]);

  const reportCursor = () => {
    const el = ta.current;
    if (!el) return;
    onCursorLine(el.value.slice(0, el.selectionStart).split("\n").length);
  };

  const replaceRange = (start: number, end: number, text: string, caret = start + text.length) => {
    const el = ta.current!;
    el.focus();
    el.setSelectionRange(start, end);
    // execCommand conserva el historial de deshacer (Ctrl+Z)
    if (!document.execCommand("insertText", false, text)) {
      onChange(src.slice(0, start) + text + src.slice(end));
    }
    requestAnimationFrame(() => el.setSelectionRange(caret, caret));
  };

  useImperativeHandle(ref, () => ({
    revealLine(line: number) {
      const el = ta.current;
      const sc = scroller.current;
      if (!el || !sc) return;
      const idx = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
      el.setSelectionRange(idx, idx);
      const y = (line - 1) * LH + PAD;
      if (y < sc.scrollTop + 40 || y > sc.scrollTop + sc.clientHeight - 80) {
        sc.scrollTo({ top: y - sc.clientHeight / 3, behavior: "smooth" });
      }
    },
    insert(text: string) {
      const el = ta.current;
      if (!el) return;
      const pos = el.selectionEnd;
      const lineEnd = src.indexOf("\n", pos);
      const at = lineEnd === -1 ? src.length : lineEnd;
      replaceRange(at, at, "\n" + text);
    },
    focus() {
      ta.current?.focus();
    },
  }));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Tab") {
      e.preventDefault();
      replaceRange(el.selectionStart, el.selectionEnd, "  ");
    } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // Mantener la indentación dentro de bloques sujeto / pose
      const before = el.value.slice(0, el.selectionStart);
      const cur = before.slice(before.lastIndexOf("\n") + 1);
      const indent = /^\s*(sujeto|pose)\s/i.test(cur) ? "  " : (cur.match(/^[ \t]+/)?.[0] ?? "");
      if (indent) {
        e.preventDefault();
        replaceRange(el.selectionStart, el.selectionEnd, "\n" + indent);
      }
    }
  };

  const height = lines.length * LH + PAD * 2 + 200;

  return (
    <div ref={scroller} className="relative h-full overflow-auto font-mono text-[13px]" style={{ lineHeight: `${LH}px` }}>
      <div className="relative flex min-w-full" style={{ minHeight: height }}>
        {/* Gutter */}
        <div className="sticky left-0 z-10 shrink-0 select-none bg-panel pr-2 text-right" style={{ paddingTop: PAD, width: 64 }} aria-hidden>
          {lines.map((_, i) => {
            const n = i + 1;
            const d = diagByLine.get(n);
            const fr = frameByLine.get(n);
            return (
              <div key={i} className="relative flex items-center justify-end gap-1.5" style={{ height: LH }} title={d?.msg}>
                {fr !== undefined && (
                  <span className={`rounded px-1 text-[10px] leading-4 tabular-nums ${n === activeLine ? "bg-accent text-white" : "bg-panel-3 text-muted"}`}>
                    {String(fr).padStart(2, "0")}
                  </span>
                )}
                <span className={`tabular-nums ${d ? (d.level === "error" ? "text-accent" : d.level === "warn" ? "text-amber" : "text-faint") : "text-faint/60"}`}>
                  {d ? "●" : n}
                </span>
              </div>
            );
          })}
        </div>
        {/* Código */}
        <div className="relative flex-1">
          {activeLine !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 border-l-2 border-accent bg-accent-soft transition-[top] duration-300"
              style={{ top: PAD + (activeLine - 1) * LH, height: LH, transitionTimingFunction: "var(--ease-out)" }}
            />
          )}
          <pre
            className="pointer-events-none relative m-0 whitespace-pre pr-10 text-muted"
            style={{ padding: `${PAD}px 12px`, font: "inherit", lineHeight: "inherit" }}
            dangerouslySetInnerHTML={{ __html: html + "\n" }}
          />
          <textarea
            ref={ta}
            value={src}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            aria-label="Guion VSL"
            onChange={(e) => {
              onChange(e.target.value);
              reportCursor();
            }}
            onKeyDown={onKeyDown}
            onKeyUp={reportCursor}
            onClick={reportCursor}
            onSelect={reportCursor}
            className="code-input absolute inset-0 resize-none overflow-hidden whitespace-pre bg-transparent outline-none focus-visible:outline-none"
            style={{ padding: `${PAD}px 12px`, font: "inherit", lineHeight: "inherit", tabSize: 2 }}
          />
        </div>
      </div>
    </div>
  );
});
