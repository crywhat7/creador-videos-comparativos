"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmtTime, slug, toSRT, toTimeline, toTimingPrompt } from "@/lib/export/exporters";
import type { RenderContext } from "@/lib/render/renderer";
import { renderVideo, videoSupported } from "@/lib/video/encode";
import { withSyncedTimes } from "@/lib/video/sync";
import type { TranscriptSync } from "@/lib/video/transcript";
import { download } from "@/lib/storage";
import type { VoiceSync } from "./useVoiceSync";

interface Props {
  rc: RenderContext;
  voice: VoiceSync;
  current: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (frame: number) => void;
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Onda del audio con pausas detectadas y los cortes de imagen encima. */
function Waveform({ voice, current, onSeek }: { voice: VoiceSync; current: number; onSeek: (f: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(300);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const a = voice.voice?.analysis;
  const sync = voice.sync;
  useEffect(() => {
    const c = ref.current;
    if (!c || !a) return;
    const H = 76;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, H);
    const x = (t: number) => (t / a.duration) * w;
    // pausas
    ctx.fillStyle = "rgba(124,196,180,0.10)";
    for (const s of a.silences) ctx.fillRect(x(s.start), 0, Math.max(1, x(s.end) - x(s.start)), H);
    // imagen actual
    if (sync) {
      ctx.fillStyle = "rgba(224,65,47,0.18)";
      ctx.fillRect(x(sync.starts[current] ?? 0), 0, Math.max(2, x(sync.durations[current] ?? 0)), H);
    }
    // onda
    ctx.fillStyle = css("--muted") || "#999";
    const per = a.envelope.length / w;
    for (let px = 0; px < w; px++) {
      let peak = 0;
      for (let i = Math.floor(px * per); i < Math.floor((px + 1) * per); i++) peak = Math.max(peak, a.envelope[i] ?? 0);
      const h = Math.max(1, peak * (H - 8));
      ctx.fillRect(px, (H - h) / 2, 1, h);
    }
    // cortes: inicio de línea (fuerte) e inicio de trozo (suave)
    if (sync) {
      const frames = voice.sync ? sync.starts : [];
      const beatSet = new Set(sync.beatStarts.map((t) => t.toFixed(3)));
      frames.forEach((t) => {
        const isBeat = beatSet.has(t.toFixed(3));
        ctx.fillStyle = isBeat ? css("--accent") || "#e0412f" : "rgba(242,240,234,0.35)";
        ctx.fillRect(Math.round(x(t)), isBeat ? 0 : H * 0.25, isBeat ? 1.5 : 1, isBeat ? H : H * 0.5);
      });
    }
  }, [a, sync, w, current, voice.sync]);

  if (!a) return null;
  return (
    <canvas
      ref={ref}
      style={{ width: w, height: 76 }}
      className="block cursor-pointer rounded-md bg-ink"
      aria-label="Onda del audio con los cambios de imagen"
      onClick={(e) => {
        if (!sync) return;
        const r = e.currentTarget.getBoundingClientRect();
        const t = ((e.clientX - r.left) / r.width) * a.duration;
        let i = 0;
        while (i + 1 < sync.starts.length && sync.starts[i + 1] <= t) i++;
        onSeek(i);
      }}
    />
  );
}

export function VideoCard({ rc, voice, current, playing, onTogglePlay, onSeek }: Props) {
  const script = rc.script;
  const audioInput = useRef<HTMLInputElement>(null);
  const timesInput = useRef<HTMLInputElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [draft, setDraft] = useState("");
  const [progress, setProgress] = useState<{ p: number; stage: string } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const base = slug(script.meta.titulo);
  const v = voice.voice;
  const sync = voice.sync;
  const ts = sync && "matchedWords" in sync ? (sync as TranscriptSync) : null;

  const createVideo = async () => {
    if (!v || !sync) return;
    setRenderError(null);
    abort.current = new AbortController();
    try {
      const blob = await renderVideo({ rc, sync, audio: v.buffer, signal: abort.current.signal, onProgress: (p, stage) => setProgress({ p, stage }) });
      download(`${base}.mp4`, blob);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setRenderError(e instanceof Error ? e.message : "No se pudo crear el video.");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const synced = sync ? withSyncedTimes(script, sync) : null;
  const diff = v ? v.analysis.duration - script.totalDuration : 0;

  return (
    <div className="rounded-2xl border border-accent/40 bg-panel-2 p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Ajustar guion al audio</p>
      <h3 className="mt-1 font-display text-[26px] leading-none italic">Video final</h3>

      {/* 1 · Audio */}
      <div
        className="mt-3 rounded-xl border border-dashed border-line-strong p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (!f) return;
          if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(f.name)) voice.setAudioFile(f);
          else f.text().then(voice.setTimesText);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] text-faint">1 · Voz</p>
            <p className="truncate text-[13px] font-medium">{voice.loading ? "Leyendo audio…" : v ? v.name : "Suelta aquí tu audio (MP3, WAV…)"}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => audioInput.current?.click()}
              className="rounded-md border border-line-strong px-2 py-1 text-[11px] transition-colors hover:border-accent hover:text-accent"
            >
              {v ? "Cambiar" : "Subir audio"}
            </button>
            {v && (
              <button type="button" onClick={voice.clearAudio} className="px-1 text-[11px] text-faint hover:text-accent">
                Quitar
              </button>
            )}
          </div>
          <input
            ref={audioInput}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) voice.setAudioFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {voice.error && <p className="mt-1 text-[12px] text-accent">{voice.error}</p>}
        {v && (
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            Dura {fmtTime(v.analysis.duration)} · el guion estimaba {fmtTime(script.totalDuration)}{" "}
            <span className="text-faint">
              ({diff >= 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(1)} s)
            </span>
          </p>
        )}
      </div>

      {/* 2 · Tiempos */}
      <div className="mt-2 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] text-faint">2 · Tiempos de la voz (opcional, más preciso)</p>
            <p className="truncate text-[13px] font-medium">
              {voice.transcript ? `${voice.transcript.source} · ${voice.transcript.segments} ${voice.transcript.precision === "palabra" ? "palabras" : "líneas"}` : "Sin tiempos: se usan las pausas del audio"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDraft(voice.timesText);
                setShowPaste((s) => !s);
              }}
              className="rounded-md border border-line-strong px-2 py-1 text-[11px] transition-colors hover:border-accent hover:text-accent"
            >
              Pegar
            </button>
            <button
              type="button"
              onClick={() => timesInput.current?.click()}
              className="rounded-md border border-line-strong px-2 py-1 text-[11px] transition-colors hover:border-accent hover:text-accent"
            >
              Archivo
            </button>
            {voice.timesText && (
              <button type="button" onClick={() => voice.setTimesText("")} className="px-1 text-[11px] text-faint hover:text-accent">
                Quitar
              </button>
            )}
          </div>
          <input
            ref={timesInput}
            type="file"
            accept=".srt,.vtt,.json,.txt,.md"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) f.text().then(voice.setTimesText);
              e.target.value = "";
            }}
          />
        </div>
        {showPaste && (
          <div className="rise mt-2 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={"001  00:00.0 → 00:02.5  ¿Izquierda o derecha?\n002  00:02.5 → 00:06.0  …\n\n(también sirve SRT, VTT o JSON)"}
              className="w-full resize-y rounded-lg border border-line bg-ink p-2 font-mono text-[11px] leading-relaxed outline-none focus:border-accent"
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  voice.setTimesText(draft);
                  setShowPaste(false);
                }}
                className="rounded-md bg-text px-2.5 py-1 text-[12px] font-semibold text-ink"
              >
                Usar estos tiempos
              </button>
              <button type="button" onClick={() => setShowPaste(false)} className="px-2 text-[12px] text-faint hover:text-text">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {voice.transcriptError && <p className="mt-1 text-[12px] text-accent">{voice.transcriptError}</p>}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(toTimingPrompt(script));
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="mt-2 text-[12px] text-teal underline-offset-4 hover:underline"
        >
          {copied ? "Prompt copiado ✓" : "Copiar prompt para pedir los tiempos"}
        </button>
      </div>

      {/* 3 · Resultado */}
      {v && sync && (
        <div className="mt-3 space-y-2.5">
          <div className="rounded-lg bg-ink/60 px-3 py-2 text-[12px] leading-relaxed text-muted">
            {ts ? (
              <>
                Ajustado con tus tiempos: <span className="text-text tabular-nums">{ts.matchedWords}/{ts.totalWords}</span> palabras encontradas.{" "}
                {script.beats.length > 1 && (
                  <>
                    <span className="text-text tabular-nums">
                      {ts.confirmedByPauses}/{script.beats.length - 1}
                    </span>{" "}
                    inicios de línea coincidían con pausas reales del audio
                    {ts.correctedByPauses > 0 && (
                      <>
                        {" "}
                        y <span className="text-text tabular-nums">{ts.correctedByPauses}</span> se corrigieron con la pausa real más cercana
                      </>
                    )}
                    .
                    {voice.forceTimes && (
                      <button type="button" onClick={() => voice.setForceTimes(false)} className="mt-1 block text-teal underline underline-offset-4">
                        Volver al ajuste automático
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {voice.rejected && (
                  <span className="mb-1.5 block text-amber">
                    Tus tiempos no coinciden con el audio: solo {voice.rejected.confirmedByPauses} de {Math.max(1, script.beats.length - 1)} inicios de línea caen
                    en una pausa real (parecen estimados, no medidos). Por eso usé el ajuste por pausas.{" "}
                    <button type="button" onClick={() => voice.setForceTimes(true)} className="text-text underline underline-offset-4 hover:text-accent">
                      Usar mis tiempos igual
                    </button>
                  </span>
                )}
                Ajustado por las pausas de la voz: <span className="text-text tabular-nums">{sync.anchored}</span> de{" "}
                <span className="tabular-nums">{Math.max(0, script.beats.length - 1)}</span> cambios de línea quedaron sobre una pausa real; el resto se reparte por palabras.
              </>
            )}
          </div>
          <Waveform voice={voice} current={current} onSeek={onSeek} />
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <label htmlFor="lead" className="text-[12px] text-muted">
              Adelantar cambios de imagen <span className="font-mono text-text tabular-nums">{voice.lead.toFixed(2)} s</span>
            </label>
            <input
              id="lead"
              type="range"
              className="rng w-28"
              min={0}
              max={0.4}
              step={0.01}
              value={voice.lead}
              onChange={(e) => voice.setLead(parseFloat(e.target.value))}
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onTogglePlay}
              className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-[13px] transition-colors hover:border-accent hover:text-accent"
            >
              {playing ? "Pausar" : "Reproducir con la voz"}
            </button>
          </div>
          <button
            type="button"
            disabled={!!progress || !videoSupported()}
            onClick={createVideo}
            className="relative w-full overflow-hidden rounded-lg bg-accent px-3 py-2.5 text-[13px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          >
            {progress && <span className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200" style={{ width: `${progress.p * 100}%` }} />}
            <span className="relative">{progress ? `${progress.stage}… ${Math.round(progress.p * 100)}%` : "Crear video MP4"}</span>
          </button>
          {progress && (
            <button type="button" onClick={() => abort.current?.abort()} className="w-full text-[12px] text-faint hover:text-accent">
              Cancelar
            </button>
          )}
          {!videoSupported() && <p className="text-[12px] text-amber">Para crear el video usa Chrome o Edge actualizados.</p>}
          {renderError && <p className="text-[12px] text-accent">{renderError}</p>}
          {synced && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="w-full text-[11px] uppercase tracking-[0.14em] text-faint">Con tiempos reales</span>
              <button type="button" onClick={() => download(`${base}-voz.srt`, toSRT(synced))} className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-text">
                SRT
              </button>
              <button
                type="button"
                onClick={() => download(`${base}-voz-trozos.srt`, toSRT(synced, true))}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-text"
              >
                SRT por trozo
              </button>
              <button
                type="button"
                onClick={() => download(`${base}-linea-de-tiempo-voz.json`, JSON.stringify(toTimeline(synced), null, 2), "application/json")}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-text"
              >
                JSON
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
