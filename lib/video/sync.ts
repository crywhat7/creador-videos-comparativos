import type { ParsedScript } from "../dsl/types";
import type { AudioAnalysis, Silence } from "./audio";

export interface SyncResult {
  /** inicio (s) de cada imagen en el audio real */
  starts: number[];
  durations: number[];
  beatStarts: number[];
  /** líneas cuyo inicio coincidió con una pausa real de la voz */
  anchored: number;
  audioDuration: number;
}

const wordCount = (s: string | null) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

/**
 * Busca la pausa más adecuada cerca de `expected`: cerca en el tiempo y, a igual
 * distancia, la más larga (las pausas largas suelen ser el fin de una frase).
 */
function pickSilence(silences: Silence[], used: Set<number>, expected: number, window: number, after: number): number {
  let best = -1;
  let bestScore = Infinity;
  silences.forEach((s, i) => {
    if (used.has(i) || s.start <= after) return;
    const center = (s.start + s.end) / 2;
    const dist = Math.abs(center - expected);
    if (dist > window) return;
    const score = dist - Math.min(s.end - s.start, 0.6) * 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * Reparte los momentos `[from, to]` entre pesos y engancha cada corte a una pausa real
 * si hay una cerca. Devuelve los cortes internos (length = weights.length - 1).
 */
export function alignSegments(
  weights: number[],
  from: number,
  to: number,
  silences: Silence[],
  window: number,
  lead: number,
): { cuts: number[]; anchored: number; speechAfter: number[] } {
  const n = weights.length;
  const cum = [0];
  for (const w of weights) cum.push(cum.at(-1)! + Math.max(0.05, w));
  const W = cum[n];
  const used = new Set<number>();
  const anchors = new Map<number, { cut: number; resume: number }>();
  let lastT = from;
  let lastK = 0;
  for (let k = 1; k < n; k++) {
    const expected = lastT + ((to - lastT) * (cum[k] - cum[lastK])) / Math.max(1e-6, W - cum[lastK]);
    const i = pickSilence(silences, used, expected, window, lastT + 0.15);
    if (i >= 0 && silences[i].end < to - 0.1) {
      used.add(i);
      anchors.set(k, { cut: Math.max(lastT + 0.1, silences[i].end - lead), resume: silences[i].end });
      lastT = silences[i].end;
      lastK = k;
    }
  }
  // Cortes sin pausa: se interpolan entre los anclados vecinos según los pesos
  const cuts: number[] = [];
  const speechAfter: number[] = [];
  let prevK = 0;
  let prevT = from;
  for (let k = 1; k < n; k++) {
    const a = anchors.get(k);
    if (a) {
      cuts.push(a.cut);
      speechAfter.push(a.resume);
      prevK = k;
      prevT = a.resume;
      continue;
    }
    let nextK = k + 1;
    while (nextK < n && !anchors.has(nextK)) nextK++;
    const nextT = nextK < n ? anchors.get(nextK)!.resume : to;
    const t = prevT + ((nextT - prevT) * (cum[k] - cum[prevK])) / Math.max(1e-6, cum[nextK] - cum[prevK]);
    cuts.push(t - lead);
    speechAfter.push(t);
  }
  return { cuts, anchored: anchors.size, speechAfter };
}

/**
 * Ajusta los tiempos de cada imagen al audio real:
 * 1) cada línea de voz se engancha a las pausas entre frases,
 * 2) dentro de cada línea, los trozos del rótulo se reparten por palabras
 *    y también se enganchan a pausas cortas (comas, respiraciones).
 * `lead` adelanta los cambios de imagen un poco respecto a la voz.
 */
export function alignToAudio(script: ParsedScript, a: AudioAnalysis, lead = 0.05): SyncResult {
  const { beats, frames } = script;
  const total = a.duration;
  if (!beats.length) return { starts: [], durations: [], beatStarts: [], anchored: 0, audioDuration: total };

  const s0 = a.speechStart;
  const s1 = a.speechEnd;
  const avg = (s1 - s0) / beats.length;
  const beatWin = Math.min(1.6, Math.max(0.4, avg * 0.5));
  const line = alignSegments(
    beats.map((b) => b.duration),
    s0,
    s1,
    a.silences,
    beatWin,
    lead,
  );

  const beatStarts = [0, ...line.cuts];
  const beatSpeech = [s0, ...line.speechAfter];
  const starts: number[] = new Array(frames.length).fill(0);

  beats.forEach((b, bi) => {
    const speechFrom = beatSpeech[bi];
    // La voz de esta línea termina donde empieza la pausa anterior al siguiente corte
    const nextCut = bi + 1 < beats.length ? line.cuts[bi] + lead : s1;
    const pauseBefore = a.silences.find((s) => s.end > speechFrom && Math.abs(s.end - nextCut) < 0.02);
    const speechTo = pauseBefore ? pauseBefore.start : nextCut;
    const fs = frames.slice(b.firstFrame, b.firstFrame + b.frameCount);
    starts[b.firstFrame] = beatStarts[bi];
    if (fs.length > 1) {
      const inner = a.silences.filter((s) => s.start > speechFrom && s.end < speechTo);
      const chunkWin = Math.min(0.5, Math.max(0.2, (speechTo - speechFrom) / fs.length / 2));
      const chunks = alignSegments(
        fs.map((f) => Math.max(1, wordCount(f.caption))),
        speechFrom,
        speechTo,
        inner,
        chunkWin,
        lead,
      );
      chunks.cuts.forEach((c, i) => (starts[b.firstFrame + 1 + i] = c));
    }
  });

  // Seguridad: siempre en orden y con un mínimo visible por imagen
  for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i], starts[i - 1] + 0.2);
  for (let i = 0; i < starts.length; i++) starts[i] = Math.round(Math.min(starts[i], total - 0.05) * 1000) / 1000;
  const durations = starts.map((s, i) => Math.max(0.05, (i + 1 < starts.length ? starts[i + 1] : total) - s));

  return { starts, durations, beatStarts, anchored: line.anchored, audioDuration: total };
}

/** Copia del guion con los tiempos reales (para SRT / JSON sincronizados). */
export function withSyncedTimes(script: ParsedScript, sync: SyncResult): ParsedScript {
  const frames = script.frames.map((f, i) => ({ ...f, start: sync.starts[i] ?? f.start, duration: sync.durations[i] ?? f.duration }));
  const beats = script.beats.map((b) => {
    const first = frames[b.firstFrame];
    const last = frames[b.firstFrame + b.frameCount - 1];
    const start = first?.start ?? b.start;
    return { ...b, start, duration: last ? Math.round((last.start + last.duration - start) * 100) / 100 : b.duration };
  });
  return { ...script, frames, beats, totalDuration: Math.round(sync.audioDuration * 10) / 10 };
}

/** Imagen que corresponde al instante `t` del audio */
export function frameAtTime(sync: SyncResult, t: number): number {
  let lo = 0;
  let hi = sync.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sync.starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
