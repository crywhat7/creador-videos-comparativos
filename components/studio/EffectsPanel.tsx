"use client";

import { useMemo } from "react";
import { EFFECTS, parseEffects } from "@/lib/dsl/parser";
import type { Frame } from "@/lib/dsl/types";
import type { RenderContext } from "@/lib/render/renderer";
import { FrameCanvas } from "./FrameCanvas";

interface Props {
  frame: Frame | null;
  rc: RenderContext;
  version: number;
  onInsert: (text: string) => void;
}

/** Galería de efectos aplicados sobre el fotograma actual. */
export function EffectsPanel({ frame, rc, version, onInsert }: Props) {
  const previews = useMemo(
    () =>
      EFFECTS.map((e) => ({
        e,
        frame: frame ? { ...frame, state: { ...frame.state, effects: parseEffects(e.example.replace(/^efecto:\s*/, "")) } } : null,
      })),
    [frame],
  );
  const active = frame?.state.effects.map((e) => e.name) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted">
        Los efectos se escriben en el guion y <strong className="text-text">persisten</strong> como cualquier propiedad. Se pueden combinar:{" "}
        <code className="font-mono text-amber">efecto: lineas-anime, temblor</code>. Para una sola línea:{" "}
        <code className="font-mono text-amber">{"> texto {efecto:destello}"}</code>. Quitar todo: <code className="font-mono text-amber">efecto: -</code>
      </p>
      {active.length > 0 && (
        <p className="text-[12px] text-faint">
          Activos en este fotograma: <span className="text-teal">{active.join(", ")}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {previews.map(({ e, frame: f }) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onInsert(e.example)}
            className={`group overflow-hidden rounded-xl border text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-accent ${
              active.includes(e.id) ? "border-accent" : "border-line"
            }`}
            style={{ transitionTimingFunction: "var(--ease-out)" }}
            title={`Insertar «${e.example}»`}
          >
            <div className="bg-paper">
              <FrameCanvas frame={f} rc={rc} width={156} version={version} className="mx-auto block" />
            </div>
            <div className="bg-panel-2 px-2.5 py-2">
              <p className="text-[13px] font-semibold">{e.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{e.desc}</p>
              <code className="mt-1 block truncate font-mono text-[10px] text-teal">{e.example}</code>
            </div>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-faint">Colores e intensidades por defecto: pestaña Diseño → Efectos. Cada efecto acepta opciones entre paréntesis.</p>
    </div>
  );
}
