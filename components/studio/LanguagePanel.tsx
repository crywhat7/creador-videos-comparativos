"use client";

import { SPEC } from "@/lib/dsl/spec";
import { styleKeys } from "@/lib/dsl/template";
import { highlightLine } from "./Editor";

function Code({ text }: { text: string }) {
  return (
    <pre
      className="overflow-x-auto rounded-lg bg-ink px-2.5 py-2 font-mono text-[11.5px] leading-[18px]"
      dangerouslySetInnerHTML={{ __html: text.split("\n").map(highlightLine).join("\n") }}
    />
  );
}

export function LanguagePanel({ onInsert }: { onInsert: (t: string) => void }) {
  return (
    <div className="space-y-6">
      {SPEC.map((s) => (
        <section key={s.title}>
          <h3 className="mb-2 font-display text-[22px] italic">{s.title}</h3>
          {s.intro && <p className="text-[13px] leading-relaxed text-muted">{s.intro}</p>}
          <div className="space-y-2.5">
            {s.entries.map((e) => (
              <div key={e.syntax} className="group">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Code text={e.syntax} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onInsert(e.example ?? e.syntax)}
                    className="mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent focus:opacity-100"
                  >
                    Insertar
                  </button>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-muted">{e.desc}</p>
                {e.example && e.example !== e.syntax && (
                  <div className="mt-1">
                    <Code text={e.example} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section>
        <h3 className="mb-2 font-display text-[22px] italic">Claves de estilo</h3>
        <div className="flex flex-wrap gap-1">
          {styleKeys().map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onInsert(`estilo ${k}: `)}
              className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-teal transition-colors hover:bg-accent-soft"
            >
              {k}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
