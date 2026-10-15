"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FRAME_FONTS } from "@/app/fonts";
import { frameAtLine, parseScript } from "@/lib/dsl/parser";
import { SAMPLE_SCRIPT } from "@/lib/dsl/sample";
import { applyOverrides, cloneTemplate, DEFAULT_TEMPLATE, FONT_KEYS, hydrateTemplate, type Template } from "@/lib/dsl/template";
import type { Diagnostic, Frame } from "@/lib/dsl/types";
import { fmtTime } from "@/lib/export/exporters";
import { onImagesChange } from "@/lib/render/images";
import { effectiveLayout, resolveMascot, slotTitle, type RenderContext } from "@/lib/render/renderer";
import { loadAssets, loadProject, putAsset, saveProject } from "@/lib/storage";
import { AssetsPanel } from "./AssetsPanel";
import { DesignPanel } from "./DesignPanel";
import { EffectsPanel } from "./EffectsPanel";
import { Editor, type EditorHandle } from "./Editor";
import { ExportPanel } from "./ExportPanel";
import { FrameCanvas } from "./FrameCanvas";
import { LanguagePanel } from "./LanguagePanel";
import { useVoiceSync } from "./useVoiceSync";
import { VideoCard } from "./VideoCard";
import { frameAtTime } from "@/lib/video/sync";

const TABS = [
  { id: "fotograma", label: "Imagen" },
  { id: "recursos", label: "Recursos" },
  { id: "efectos", label: "Efectos" },
  { id: "diseno", label: "Diseño" },
  { id: "exportar", label: "Exportar" },
  { id: "lenguaje", label: "Lenguaje" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const SNIPPETS: { label: string; text: string }[] = [
  { label: "Escena", text: "\n== Nueva escena\nA: \nB: \nmuneco: apunta-izq feliz\n> " },
  { label: "Línea", text: "> " },
  { label: "Efecto", text: "efecto: lineas-anime" },
  { label: "Sujeto", text: 'sujeto id "Título"\n  imagen: descripción para generar la imagen, fondo blanco' },
  { label: "Extra", text: 'extra dato: "TEXTO" (x:50, y:12, tam:56, color:acento)' },
];

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export default function Studio() {
  const [source, setSource] = useState(SAMPLE_SCRIPT);
  const [template, setTemplate] = useState<Template>(() => cloneTemplate(DEFAULT_TEMPLATE));
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [placeholders, setPlaceholders] = useState(true);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("fotograma");
  const [playing, setPlaying] = useState(false);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const [showDiag, setShowDiag] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [stageRef, stage] = useElementSize<HTMLDivElement>();

  // ── Carga inicial (solo en el navegador)
  useEffect(() => {
    loadAssets().then((a) => {
      const p = loadProject();
      if (p) {
        setSource(p.script);
        setTemplate(hydrateTemplate(p.template));
      }
      setAssets(a);
      setLoaded(true);
    });
    Promise.all(FONT_KEYS.flatMap((k) => [400, 800].map((w) => document.fonts.load(`${w} 40px ${FRAME_FONTS[k]}`)))).finally(() =>
      setVersion((v) => v + 1),
    );
    return onImagesChange(() => setVersion((v) => v + 1));
  }, []);

  // ── Autoguardado
  useEffect(() => {
    if (!loaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(false);
    const id = setTimeout(() => {
      saveProject({ script: source, template, updatedAt: Date.now() });
      setSaved(true);
    }, 500);
    return () => clearTimeout(id);
  }, [source, template, loaded]);

  const script = useMemo(() => parseScript(source), [source]);
  const lines = useMemo(() => source.split("\n"), [source]);

  const diagnostics = useMemo(() => {
    const extra: Diagnostic[] = [];
    applyOverrides(template, script.globalStyle, (d) => {
      const key = d.msg.match(/"([^"]+)"/)?.[1] ?? "";
      const idx = lines.findIndex((l) => l.includes("@estilo") && l.includes(key));
      extra.push({ ...d, line: idx >= 0 ? idx + 1 : 1 });
    });
    return [...script.diagnostics, ...extra].sort((a, b) => a.line - b.line);
  }, [script, template, lines]);

  const rc: RenderContext = useMemo(
    () => ({ script, template, assets, fonts: FRAME_FONTS, placeholders }),
    [script, template, assets, placeholders],
  );

  const frames = script.frames;
  const current = Math.min(Math.max(0, selected), Math.max(0, frames.length - 1));
  const frame: Frame | null = frames[current] ?? null;

  const go = useCallback(
    (i: number, reveal = true) => {
      const n = Math.max(0, Math.min(frames.length - 1, i));
      setSelected(n);
      if (reveal && frames[n]) editor.current?.revealLine(frames[n].line);
    },
    [frames],
  );

  // ── Atajos de teclado fuera del editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("textarea, input, select")) return;
      if (e.key === "ArrowRight") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go]);

  // ── Mantener visible el fotograma activo en la tira
  useEffect(() => {
    strip.current?.querySelector(`[data-frame="${current}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current]);

  const onAsset = (key: string, dataUrl: string | null) => {
    setAssets((a) => {
      const n = { ...a };
      if (dataUrl === null) delete n[key];
      else n[key] = dataUrl;
      return n;
    });
    putAsset(key, dataUrl);
  };

  // ── Voz: audio real + tiempos → tiempo de cada imagen
  const voice = useVoiceSync(script, assets, onAsset);
  const sync = voice.sync;
  const audioEl = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // ── Reproducción sin audio: duraciones estimadas
  useEffect(() => {
    if (!playing || !frame || sync) return;
    const id = setTimeout(() => {
      if (current >= frames.length - 1) setPlaying(false);
      else go(current + 1);
    }, frame.duration * 1000);
    return () => clearTimeout(id);
  }, [playing, frame, current, frames.length, go, sync]);

  // ── Reproducción con la voz real: la imagen sigue al audio
  useEffect(() => {
    const el = audioEl.current;
    if (!playing || !sync || !el) return;
    el.currentTime = sync.starts[currentRef.current] ?? 0;
    el.play().catch(() => setPlaying(false));
    let raf = 0;
    const loop = () => {
      const i = frameAtTime(sync, el.currentTime);
      if (i !== currentRef.current) setSelected(i);
      if (el.ended) setPlaying(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.pause();
    };
  }, [playing, sync]);

  const errors = diagnostics.filter((d) => d.level === "error").length;
  const warns = diagnostics.filter((d) => d.level === "warn").length;

  // Tamaño de la vista previa: cabe en el escenario manteniendo la proporción
  const ratio = script.meta.alto / script.meta.ancho;
  const previewW = Math.max(160, Math.floor(Math.min(stage.w - 48, (stage.h - 32) / ratio)));

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-ink text-text">
      <audio ref={audioEl} src={voice.voice?.url} preload="auto" className="hidden" onEnded={() => setPlaying(false)} />
      {/* ── Barra superior */}
      <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line px-5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[30px] leading-none italic tracking-[-0.02em]">Versus</span>
          <span className="h-[18px] w-[3px] -skew-x-[18deg] rounded-sm bg-accent" aria-hidden />
          <span className="text-[11px] uppercase tracking-[0.2em] text-faint">estudio de guiones</span>
        </div>
        <div className="mx-auto hidden min-w-0 items-center gap-3 md:flex">
          <span className="truncate text-[14px] font-medium">{script.meta.titulo}</span>
          <span className="text-faint">·</span>
          <span className="text-[12px] text-muted tabular-nums">
            {frames.length} fotogramas · {script.scenes.length} escenas · {fmtTime(script.totalDuration)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-faint" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full transition-colors ${saved ? "bg-teal" : "bg-amber"}`} />
            {saved ? "Guardado" : "Guardando…"}
          </span>
          <button
            type="button"
            onClick={() => setTab("exportar")}
            className="rounded-full bg-text px-4 py-1.5 text-[13px] font-semibold text-ink transition-transform duration-300 hover:scale-[1.03]"
            style={{ transitionTimingFunction: "var(--ease-out)" }}
          >
            Exportar
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(300px,340px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(340px,380px)]">
        {/* ── Editor */}
        <section className="flex min-h-[420px] min-w-0 flex-col border-line bg-panel lg:border-r" aria-label="Editor de guion">
          <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-3 whitespace-nowrap [scrollbar-width:none]">
            <span className="mr-2 shrink-0 font-mono text-[11px] text-faint">guion.vsl</span>
            {SNIPPETS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => editor.current?.insert(s.text)}
                className="shrink-0 rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-panel-3 hover:text-text"
              >
                + {s.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <Editor
              ref={editor}
              value={source}
              onChange={setSource}
              onCursorLine={(l) => {
                const i = frameAtLine(frames, l);
                if (i >= 0 && frames[i].line !== frame?.line) setSelected(i);
              }}
              diagnostics={diagnostics}
              frames={frames}
              activeLine={frame?.line ?? null}
            />
          </div>
          {/* Diagnósticos */}
          <div className="shrink-0 border-t border-line">
            <button
              type="button"
              onClick={() => setShowDiag((s) => !s)}
              className="flex h-9 w-full items-center gap-3 px-3 text-[12px] text-muted hover:text-text"
              aria-expanded={showDiag}
            >
              <span className={errors ? "text-accent" : "text-faint"}>● {errors} errores</span>
              <span className={warns ? "text-amber" : "text-faint"}>● {warns} avisos</span>
              <span className="ml-auto text-faint">{showDiag ? "ocultar" : "ver"}</span>
            </button>
            {showDiag && (
              <ul className="max-h-40 overflow-auto border-t border-line py-1">
                {diagnostics.length === 0 && <li className="px-3 py-1 text-[12px] text-faint">Todo en orden.</li>}
                {diagnostics.map((d, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => editor.current?.revealLine(d.line)}
                      className="flex w-full gap-3 px-3 py-1 text-left text-[12px] hover:bg-panel-2"
                    >
                      <span className="w-10 shrink-0 font-mono text-faint tabular-nums">L{d.line}</span>
                      <span className={d.level === "error" ? "text-accent" : d.level === "warn" ? "text-amber" : "text-muted"}>{d.msg}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Escenario */}
        <section className="flex min-h-[640px] min-w-0 flex-col" aria-label="Vista previa">
          <div className="flex shrink-0 items-end justify-between px-6 pt-4">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[56px] leading-[0.8] tracking-[-0.03em] tabular-nums">{String(current + 1).padStart(2, "0")}</span>
              <span className="font-display text-[22px] text-faint italic tabular-nums">/ {String(frames.length).padStart(2, "0")}</span>
              {frame && (
                <span className="ml-3 self-center rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted tabular-nums">
                  línea {frame.beat + 1}/{script.beats.length}
                  {frame.chunkCount > 1 && <span className="text-accent"> · trozo {frame.chunkIndex + 1}/{frame.chunkCount}</span>}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Escena {frame ? frame.sceneIndex + 1 : "–"}</p>
              <p className="max-w-[240px] truncate text-[14px] font-medium">{frame?.scene ?? "Sin fotogramas"}</p>
            </div>
          </div>

          <div ref={stageRef} className="relative grid min-h-0 flex-1 place-items-center">
            <div
              key={current}
              className="frame-in overflow-hidden rounded-[14px] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)]"
            >
              {stage.w > 0 && <FrameCanvas frame={frame} rc={rc} width={previewW} version={version} />}
            </div>
            {frame && (
              <span className="absolute right-6 bottom-3 font-mono text-[11px] text-faint tabular-nums">
                {sync ? (
                  <span className="text-teal">
                    voz {fmtTime(sync.starts[current] ?? 0)} · {(sync.durations[current] ?? 0).toFixed(2)}s
                  </span>
                ) : (
                  <>
                    {fmtTime(frame.start)} · {frame.duration.toFixed(1)}s{frame.explicitDuration ? " fija" : ""}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Controles */}
          <div className="flex shrink-0 items-center justify-center gap-2 py-2">
            <IconButton label="Anterior (←)" onClick={() => go(current - 1)}>
              <path d="M15 6l-6 6 6 6" />
            </IconButton>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pausar" : "Reproducir"}
              className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white transition-transform duration-300 hover:scale-110"
              style={{ transitionTimingFunction: "var(--ease-out)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M8 5v14l11-7z" />}
              </svg>
            </button>
            <IconButton label="Siguiente (→)" onClick={() => go(current + 1)}>
              <path d="M9 6l6 6-6 6" />
            </IconButton>
          </div>

          {/* Tira de fotogramas */}
          <div ref={strip} className="flex h-[132px] shrink-0 gap-3 overflow-x-auto border-t border-line px-4 py-3">
            {frames.map((f) => {
              const newScene = f.index === 0 || frames[f.index - 1].sceneIndex !== f.sceneIndex;
              const sameBeat = f.chunkIndex > 0;
              return (
                <div key={f.index} className={`flex shrink-0 items-stretch gap-2 ${sameBeat ? "-ml-1.5" : ""}`}>
                  {newScene && f.index > 0 && <span className="w-px self-stretch bg-line-strong" aria-hidden />}
                  <button
                    type="button"
                    data-frame={f.index}
                    onClick={() => go(f.index)}
                    title={f.clean}
                    className={`group relative overflow-hidden rounded-md transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 ${
                      f.index === current ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[0_0_0_1px_var(--line-strong)]"
                    }`}
                    style={{ transitionTimingFunction: "var(--ease-out)" }}
                  >
                    <FrameCanvas frame={f} rc={rc} width={58} version={version} />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-0.5 text-left font-mono text-[9px] text-white tabular-nums">
                      {String(f.index + 1).padStart(2, "0")} · {f.duration.toFixed(1)}s
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Inspector */}
        <aside className="flex min-h-[480px] min-w-0 flex-col overflow-hidden border-line bg-panel lg:border-l" aria-label="Inspector">
          <nav className="flex h-11 shrink-0 items-stretch overflow-x-auto border-b border-line px-1 [scrollbar-width:none]" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex flex-1 shrink-0 items-center justify-center whitespace-nowrap px-1 text-[11.5px] transition-colors ${tab === t.id ? "text-text" : "text-faint hover:text-muted"}`}
              >
                {t.label}
                {tab === t.id && <span className="absolute inset-x-1 bottom-0 h-[2px] rounded bg-accent" />}
              </button>
            ))}
          </nav>
          <div key={tab} className="rise min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
            {tab === "fotograma" && <FrameInfo frame={frame} rc={rc} onReveal={(l) => editor.current?.revealLine(l)} />}
            {tab === "recursos" && (
              <AssetsPanel
                script={script}
                assets={assets}
                template={template}
                onAsset={onAsset}
                onInsert={(t) => editor.current?.insert(t)}
                onReveal={(l) => editor.current?.revealLine(l)}
              />
            )}
            {tab === "efectos" && <EffectsPanel frame={frame} rc={rc} version={version} onInsert={(t) => editor.current?.insert(t)} />}
            {tab === "diseno" && (
              <DesignPanel template={template} onChange={setTemplate} placeholders={placeholders} onPlaceholders={setPlaceholders} overrides={script.globalStyle} />
            )}
            {tab === "exportar" && (
              <div className="space-y-2.5">
              <VideoCard
                rc={rc}
                voice={voice}
                current={current}
                playing={playing}
                onTogglePlay={() => setPlaying((p) => !p)}
                onSeek={(i) => go(i, false)}
              />
              <ExportPanel
                rc={rc}
                source={source}
                onImport={(p) => {
                  setSource(p.script);
                  if (p.template) setTemplate(hydrateTemplate(p.template));
                  if (p.assets) for (const [k, v] of Object.entries(p.assets)) onAsset(k, v);
                  setSelected(0);
                }}
              />
              </div>
            )}
            {tab === "lenguaje" && <LanguagePanel onInsert={(t) => editor.current?.insert(t)} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel-3 hover:text-text"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function FrameInfo({ frame, rc, onReveal }: { frame: Frame | null; rc: RenderContext; onReveal: (l: number) => void }) {
  if (!frame) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
        <p className="font-display text-[26px] italic">Sin fotogramas</p>
        <p className="mt-2 text-[13px] text-muted">
          Escribe una línea que empiece con <code className="font-mono text-accent">&gt;</code> en el editor.
        </p>
      </div>
    );
  }
  const st = frame.state;
  const m = st.mascot ? resolveMascot(st.mascot, rc.script) : null;
  const rows: [string, React.ReactNode][] = [
    ["A", st.A ? slotTitle(st.A, rc.script).replace(/\n/g, " ") : "—"],
    ["B", effectiveLayout(st) === "centro" ? "(layout centro)" : st.B ? slotTitle(st.B, rc.script).replace(/\n/g, " ") : "—"],
    ...(effectiveLayout(st) === "trio" ? [["C", st.C ? slotTitle(st.C, rc.script).replace(/\n/g, " ") : "—"] as [string, React.ReactNode]] : []),
    ["Rótulo", frame.caption ? `«${frame.caption}»${frame.chunkCount > 1 ? ` (trozo ${frame.chunkIndex + 1}/${frame.chunkCount})` : ""}${st.captionMode === "fijo" ? " · fijo" : ""}` : "—"],
    ["Muñeco", m ? `${m.base} · ${m.face}` : "—"],
    ["Foco", st.focus],
    ["Efectos", st.effects.map((e) => e.name).join(", ") || "—"],
    ["Extras", Object.values(st.extras).map((e) => e.text).join(", ") || "—"],
  ];
  if (Object.keys(st.style).length) rows.push(["Estilo", Object.entries(st.style).map(([k, v]) => `${k}=${v}`).join(", ")]);
  const segs = frame.narration.split(/(\[[^\]]*\])/g);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Narración</p>
        <p className="mt-2 font-display text-[28px] leading-[1.12] tracking-[-0.01em] text-balance break-words">
          {frame.narration
            ? segs.map((s, i) =>
                s.startsWith("[") ? (
                  <span key={i} className="mx-0.5 align-middle font-mono text-[12px] text-violet not-italic">
                    {s}
                  </span>
                ) : (
                  <span key={i}>{s}</span>
                ),
              )
            : <span className="text-faint italic">Sin narración</span>}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Inicio", fmtTime(frame.start)],
          ["Imagen", `${frame.duration.toFixed(2)}s`],
          ["Palabras", String(frame.clean.split(/\s+/).filter(Boolean).length)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-panel-2 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-faint">{k}</dt>
            <dd className="mt-0.5 font-mono text-[15px] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Subtítulo</p>
        <p className="mt-1 text-[14px] text-muted">{frame.subtitle ?? <span className="italic text-faint">oculto</span>}</p>
      </div>
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-faint">En pantalla</p>
        <dl className="divide-y divide-line rounded-xl border border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[80px_1fr] gap-2 px-3 py-2 text-[13px]">
              <dt className="text-faint">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {frame.note && (
        <div className="rounded-xl border-l-2 border-amber bg-panel-2 px-3 py-2 text-[13px]">
          <p className="text-[10px] uppercase tracking-[0.14em] text-amber">Nota de dirección</p>
          <p className="mt-0.5 text-muted">{frame.note}</p>
        </div>
      )}
      <button type="button" onClick={() => onReveal(frame.line)} className="text-[12px] text-faint underline-offset-4 hover:text-accent hover:underline">
        Ir a la línea {frame.line} del guion
      </button>
    </div>
  );
}
