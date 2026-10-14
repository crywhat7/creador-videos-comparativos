"use client";

import { useMemo, useRef, useState } from "react";
import { BUILTIN_POSES, FACES } from "@/lib/dsl/parser";
import type { ParsedScript } from "@/lib/dsl/types";
import type { Template } from "@/lib/dsl/template";
import { mascotDataURL } from "@/lib/render/mascot";
import { subjectSource } from "@/lib/render/renderer";
import { fileToDataURL } from "@/lib/storage";

interface Props {
  script: ParsedScript;
  assets: Record<string, string>;
  template: Template;
  onAsset: (key: string, dataUrl: string | null) => void;
  onInsert: (text: string) => void;
  onReveal: (line: number) => void;
}

function Drop({ onFile, children, className }: { onFile: (f: File) => void; children: React.ReactNode; className?: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith("image/")) onFile(f);
      }}
      className={`${className} transition-[box-shadow,background-color] duration-300 ${over ? "bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]" : ""}`}
    >
      {children}
    </div>
  );
}

function UploadButton({ onFile, label = "Subir" }: { onFile: (f: File) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="rounded-md border border-line-strong px-2 py-1 text-[11px] transition-colors hover:border-accent hover:text-accent"
      >
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function AssetsPanel({ script, assets, template, onAsset, onInsert, onReveal }: Props) {
  const [face, setFace] = useState<string>("feliz");
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of script.frames) for (const r of [f.state.A, f.state.B]) if (r?.subjectId) m.set(r.subjectId, (m.get(r.subjectId) ?? 0) + 1);
    return m;
  }, [script.frames]);

  const subjects = Object.values(script.subjects);
  const missing = subjects.filter((s) => !subjectSource(s, s.id, assets)).length;
  const upload = async (key: string, f: File) => onAsset(key, await fileToDataURL(f));

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-[22px] italic">Sujetos</h3>
          <span className="text-[11px] text-faint tabular-nums">
            {subjects.length - missing}/{subjects.length} con imagen
          </span>
        </header>
        {subjects.length === 0 && (
          <p className="rounded-xl border border-dashed border-line-strong p-4 text-[13px] text-muted">
            Define sujetos en el guion con <code className="font-mono text-amber">sujeto id &quot;Título&quot;</code>.
          </p>
        )}
        <div className="space-y-2">
          {subjects.map((s) => {
            const src = subjectSource(s, s.id, assets);
            const key = s.file && !/^(https?:|data:|\/)/.test(s.file) ? s.file : `sujeto:${s.id}`;
            return (
              <Drop key={s.id} onFile={(f) => upload(key, f)} className="flex gap-3 rounded-xl border border-line bg-panel-2 p-2.5">
                <div className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-lg bg-paper">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="px-1 text-center text-[10px] leading-tight text-black/40">suelta una imagen</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <button type="button" onClick={() => onReveal(s.line)} className="truncate text-left text-[14px] font-semibold hover:text-accent">
                      {s.title.replace(/\n/g, " ")}
                    </button>
                    <code className="font-mono text-[11px] text-faint">{s.id}</code>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{s.prompt ?? "Sin prompt de imagen"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <UploadButton onFile={(f) => upload(key, f)} label={src ? "Cambiar" : "Subir"} />
                    {src && assets[key] && (
                      <button type="button" onClick={() => onAsset(key, null)} className="rounded-md px-2 py-1 text-[11px] text-faint hover:text-accent">
                        Quitar
                      </button>
                    )}
                    {s.prompt && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(s.prompt!)}
                        className="rounded-md px-2 py-1 text-[11px] text-faint hover:text-text"
                      >
                        Copiar prompt
                      </button>
                    )}
                    <span className="ml-auto text-[11px] text-faint tabular-nums">{usage.get(s.id) ?? 0} fot.</span>
                  </div>
                </div>
              </Drop>
            );
          })}
        </div>
      </section>

      <section>
        <header className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-[22px] italic">Muñeco</h3>
          <div className="flex gap-1" role="radiogroup" aria-label="Cara">
            {FACES.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={face === f}
                onClick={() => setFace(f)}
                className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${face === f ? "bg-text text-ink" : "text-faint hover:text-text"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </header>
        <p className="mb-2 text-[12px] text-muted">Clic para insertar en el guion. Suelta una imagen sobre una pose para reemplazar el dibujo por tu propio personaje.</p>
        <div className="grid grid-cols-3 gap-2">
          {BUILTIN_POSES.map((p) => {
            const custom = assets[`pose:${p} ${face}`] ?? assets[`pose:${p}`];
            return (
              <Drop key={p} onFile={(f) => upload(`pose:${p}`, f)} className="group relative rounded-xl border border-line bg-paper">
                <button type="button" onClick={() => onInsert(`muneco: ${p} ${face}`)} className="block w-full p-1.5" title={`muneco: ${p} ${face}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={custom ?? mascotDataURL(p, face, template.muneco)}
                    alt={`Pose ${p}`}
                    className="mx-auto h-[92px] object-contain transition-transform duration-500 group-hover:scale-[1.06]"
                    style={{ transitionTimingFunction: "var(--ease-out)" }}
                  />
                  <span className="mt-1 block text-center font-mono text-[10px] text-black/60">{p}</span>
                </button>
                {assets[`pose:${p}`] && (
                  <button
                    type="button"
                    onClick={() => onAsset(`pose:${p}`, null)}
                    className="absolute top-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white"
                    aria-label={`Quitar imagen personalizada de ${p}`}
                  >
                    ×
                  </button>
                )}
              </Drop>
            );
          })}
        </div>
        <Drop onFile={(f) => upload("pose:*", f)} className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-line-strong px-3 py-2.5">
          <span className="text-[12px] text-muted">{assets["pose:*"] ? "Personaje propio activo para todas las poses" : "Personaje propio para todas las poses"}</span>
          <div className="flex gap-1.5">
            <UploadButton onFile={(f) => upload("pose:*", f)} />
            {assets["pose:*"] && (
              <button type="button" onClick={() => onAsset("pose:*", null)} className="px-1 text-[11px] text-faint hover:text-accent">
                Quitar
              </button>
            )}
          </div>
        </Drop>
        {Object.values(script.poses).length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.14em] text-faint">Poses con nombre</p>
            {Object.values(script.poses).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1 text-[12px] hover:bg-panel-2">
                <button type="button" onClick={() => onReveal(p.line)} className="font-mono text-teal">
                  {p.id}
                </button>
                <span className="text-faint">
                  {p.base} · {p.face ?? "feliz"}
                </span>
                <UploadButton onFile={(f) => upload(`pose:${p.id}`, f)} label={assets[`pose:${p.id}`] ? "Cambiar" : "Imagen"} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
