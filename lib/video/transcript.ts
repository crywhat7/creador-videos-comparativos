import type { ParsedScript } from "../dsl/types";
import type { AudioAnalysis } from "./audio";
import { alignSegments, type SyncResult } from "./sync";

/** Una palabra dicha en el audio, con su tiempo. */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  words: TimedWord[];
  /** "palabra" = cada palabra tiene su tiempo real; "frase" = solo inicio/fin de cada línea o subtítulo */
  precision: "palabra" | "frase";
  source: string;
  /** cantidad de líneas o bloques leídos */
  segments: number;
}

/** minúsculas, sin tildes ni puntuación: para comparar palabras */
export const normWord = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

function wordsFromChars(chars: string[], starts: number[], ends: number[]): TimedWord[] {
  const out: TimedWord[] = [];
  let cur: TimedWord | null = null;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: "", start: starts[i], end: ends[i] };
    cur.text += ch;
    cur.end = ends[i];
  });
  if (cur) out.push(cur);
  return out;
}

/** Reparte el tiempo de un bloque entre sus palabras según su largo (aproximado). */
function wordsFromCue(text: string, start: number, end: number): TimedWord[] {
  const ws = text.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  const total = ws.reduce((n, w) => n + w.length + 1, 0) || 1;
  let t = start;
  return ws.map((w) => {
    const d = ((end - start) * (w.length + 1)) / total;
    const word = { text: w, start: t, end: t + d };
    t += d;
    return word;
  });
}

/** "1:02.2", "01:02,2", "00:01:02.200", "62.2" → segundos */
function parseClock(s: string): number {
  const parts = s.trim().replace(",", ".").split(":");
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}

const CLOCK = String.raw`\d{1,2}(?::\d{2}){1,2}(?:[.,]\d{1,3})?`;
const ARROW = String.raw`\s*(?:→|->|-->|–|—|-)\s*`;

/** Formato del guion de voz: "001  00:00.0 → 00:02.5  texto" (el número es opcional) */
function parseLineList(text: string): { words: TimedWord[]; count: number } | null {
  const re = new RegExp(String.raw`^\s*(?:\*\*)?(?:\d{1,4}[.)]?)?(?:\*\*)?\s*[·|]?\s*\[?(${CLOCK})${ARROW}(${CLOCK})\]?\s*[·|:-]?\s*(.+)$`);
  const words: TimedWord[] = [];
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const a = parseClock(m[1]);
    const b = parseClock(m[2]);
    if (!(b > a)) continue;
    words.push(...wordsFromCue(m[3].trim(), a, b));
    count++;
  }
  return count ? { words, count } : null;
}

function parseSubtitles(text: string): { words: TimedWord[]; count: number } {
  const words: TimedWord[] = [];
  let count = 0;
  const re = new RegExp(String.raw`(${CLOCK})\s*-->\s*(${CLOCK})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)`, "g");
  for (const m of text.replace(/\r/g, "").matchAll(re)) {
    words.push(...wordsFromCue(m[3].trim(), parseClock(m[1]), parseClock(m[2])));
    count++;
  }
  return { words, count };
}

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)));

/**
 * Lee tiempos de la voz. Formatos aceptados:
 * - Lista de líneas: "001  00:00.0 → 00:02.5  texto" (lo que pide el prompt de tiempos)
 * - SRT / VTT
 * - JSON de ElevenLabs "with timestamps": { alignment: { characters, character_start_times_seconds, ... } }
 * - JSON con palabras: { words: [{ text, start, end }] } (alineación forzada / Scribe de ElevenLabs)
 * - JSON de Whisper: { segments: [{ words: [...] }] } o { segments: [{ text, start, end }] }
 */
export function parseTranscript(text: string, fileName = ""): Transcript {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("El texto de tiempos está vacío.");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const data = JSON.parse(trimmed) as Json | Json[];
    const root = (Array.isArray(data) ? { words: data } : data) as Json;
    const align = (root.alignment ?? root.normalized_alignment) as Json | undefined;
    if (align && Array.isArray(align.characters)) {
      const words = wordsFromChars(
        align.characters as string[],
        (align.character_start_times_seconds as number[]) ?? [],
        (align.character_end_times_seconds as number[]) ?? [],
      );
      return { words, precision: "palabra", source: "ElevenLabs (tiempos por letra)", segments: words.length };
    }
    const fromWordList = (list: Json[]) =>
      list
        .filter((w) => (w.type ?? "word") === "word")
        .map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: num(w.start), end: num(w.end) }))
        .filter((w) => w.text && isFinite(w.start));
    if (Array.isArray(root.words)) {
      const words = fromWordList(root.words as Json[]);
      return { words, precision: "palabra", source: "JSON (tiempos por palabra)", segments: words.length };
    }
    if (Array.isArray(root.segments)) {
      const segs = root.segments as Json[];
      if (segs.some((s) => Array.isArray(s.words))) {
        const words = fromWordList(segs.flatMap((s) => (s.words as Json[]) ?? []));
        return { words, precision: "palabra", source: "Whisper (tiempos por palabra)", segments: words.length };
      }
      const words = segs.flatMap((s) => wordsFromCue(String(s.text ?? ""), num(s.start), num(s.end)));
      return { words, precision: "frase", source: "JSON (tiempos por frase)", segments: segs.length };
    }
    throw new Error("No reconozco este JSON de tiempos.");
  }
  if (/-->/.test(trimmed)) {
    const sub = parseSubtitles(trimmed);
    if (sub.count) return { ...sub, segments: sub.count, precision: "frase", source: fileName.toLowerCase().endsWith(".vtt") ? "VTT" : "SRT" };
  }
  const list = parseLineList(trimmed);
  if (list) return { words: list.words, precision: "frase", source: "Lista de líneas con tiempos", segments: list.count };
  throw new Error('No encontré tiempos. Usa líneas tipo "001  00:00.0 → 00:02.5  texto", SRT, VTT o JSON.');
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  let diff = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
  return diff <= Math.max(1, Math.floor(n / 4));
}

export interface TranscriptSync extends SyncResult {
  /** palabras del guion encontradas en los tiempos */
  matchedWords: number;
  totalWords: number;
  /** líneas cuyo inicio coincide con una pausa real del audio (verificación) */
  confirmedByPauses: number;
  /** líneas cuyo tiempo no coincidía y se corrigió con una pausa real cercana */
  correctedByPauses: number;
}

/**
 * Ajusta el guion al audio usando los tiempos:
 * 1) alinea las palabras del guion con las de los tiempos (tolera diferencias),
 * 2) cada línea empieza cuando se dice su primera palabra,
 * 3) los trozos del rótulo usan tiempos por palabra si existen; si no, las pausas reales del audio.
 */
export function alignWithTranscript(script: ParsedScript, tr: Transcript, analysis: AudioAnalysis | null, duration: number, lead = 0.05): TranscriptSync {
  const { frames, beats } = script;
  const tokens: { w: string; frame: number; beat: number }[] = [];
  for (const b of beats) {
    const fs = frames.slice(b.firstFrame, b.firstFrame + b.frameCount);
    const chunkWords = fs.map((f) => (f.caption ? f.caption.split(/\s+/).filter(Boolean).length : 0));
    const words = b.clean.split(/\s+/).filter(Boolean);
    const karaoke = fs.length > 1 && chunkWords.reduce((x, y) => x + y, 0) === words.length;
    let fi = 0;
    let used = 0;
    for (const w of words) {
      if (karaoke) {
        while (fi < fs.length - 1 && used >= chunkWords[fi]) {
          fi++;
          used = 0;
        }
        used++;
      }
      const nw = normWord(w);
      if (nw) tokens.push({ w: nw, frame: fs[karaoke ? fi : 0].index, beat: b.index });
    }
  }
  const audio = tr.words.map((w) => ({ ...w, n: normWord(w.text) })).filter((w) => w.n);

  // Alineación de secuencias (Needleman–Wunsch)
  const n = tokens.length;
  const m = audio.length;
  const GAP = -1;
  const sc = (i: number, j: number) => (tokens[i].w === audio[j].n ? 3 : similar(tokens[i].w, audio[j].n) ? 1 : -2);
  const score = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = 1; i <= n; i++) score[at(i, 0)] = i * GAP;
  for (let j = 1; j <= m; j++) score[at(0, j)] = j * GAP;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      score[at(i, j)] = Math.max(score[at(i - 1, j - 1)] + sc(i - 1, j - 1), score[at(i - 1, j)] + GAP, score[at(i, j - 1)] + GAP);
  const match = new Array<TimedWord | null>(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = sc(i - 1, j - 1);
    if (score[at(i, j)] === score[at(i - 1, j - 1)] + s) {
      if (s > 0) match[i - 1] = audio[j - 1];
      i--;
      j--;
    } else if (score[at(i, j)] === score[at(i - 1, j)] + GAP) i--;
    else j--;
  }
  const matchedWords = match.filter(Boolean).length;

  // Inicio y fin hablado de cada línea
  const beatStart = new Array<number>(beats.length).fill(NaN);
  const beatEnd = new Array<number>(beats.length).fill(NaN);
  tokens.forEach((t, i) => {
    const w = match[i];
    if (!w) return;
    if (isNaN(beatStart[t.beat])) beatStart[t.beat] = w.start;
    beatEnd[t.beat] = w.end;
  });
  // Líneas sin coincidencias: interpolar
  const fill = (arr: number[]) => {
    for (let i = 0; i < arr.length; i++) {
      if (!isNaN(arr[i])) continue;
      let j = i + 1;
      while (j < arr.length && isNaN(arr[j])) j++;
      const a = i > 0 ? arr[i - 1] : 0;
      const b = j < arr.length ? arr[j] : duration;
      for (let k = i; k < j; k++) arr[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
      i = j - 1;
    }
  };
  fill(beatStart);
  for (let i = 0; i < beatEnd.length; i++) if (isNaN(beatEnd[i])) beatEnd[i] = i + 1 < beatStart.length ? beatStart[i + 1] : duration;

  // Verificación y corrección con las pausas reales del audio.
  // Los tiempos por frase a veces son estimados (no medidos): se usan como guía y cada
  // inicio de línea se engancha al fin de la pausa real más cercana (hasta 1 s).
  let confirmedByPauses = 0;
  let correctedByPauses = 0;
  if (analysis) {
    const used = new Set<number>();
    for (let b = 1; b < beats.length; b++) {
      const window = tr.precision === "frase" ? 0.6 : 0.35;
      let best = -1;
      let bestD = Infinity;
      analysis.silences.forEach((s, i) => {
        const d = Math.abs(s.end - beatStart[b]);
        if (used.has(i) || d > window || s.end <= beatStart[b - 1] + 0.3) return;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) continue;
      if (bestD < 0.35) confirmedByPauses++;
      if (tr.precision === "frase") {
        const s = analysis.silences[best];
        used.add(best);
        if (bestD >= 0.35) correctedByPauses++;
        beatStart[b] = s.end;
        beatEnd[b - 1] = Math.min(beatEnd[b - 1], s.start);
        if (beatEnd[b - 1] <= beatStart[b - 1]) beatEnd[b - 1] = s.start;
      }
    }
  }

  const starts = new Array<number>(frames.length).fill(0);
  beats.forEach((b, bi) => {
    const fs = frames.slice(b.firstFrame, b.firstFrame + b.frameCount);
    starts[b.firstFrame] = bi === 0 ? 0 : beatStart[bi] - lead;
    if (fs.length < 2) return;
    if (tr.precision === "palabra") {
      // Cada trozo empieza con su primera palabra encontrada
      fs.forEach((f, k) => {
        if (k === 0) return;
        const ti = tokens.findIndex((t, i) => t.frame === f.index && match[i]);
        starts[f.index] = ti >= 0 ? match[ti]!.start - lead : NaN;
      });
    } else {
      const from = beatStart[bi];
      const to = Math.max(from + 0.2, beatEnd[bi]);
      const inner = analysis ? analysis.silences.filter((s) => s.start > from && s.end < to) : [];
      const win = Math.min(0.5, Math.max(0.2, (to - from) / fs.length / 2));
      const { cuts } = alignSegments(
        fs.map((f) => Math.max(1, f.caption ? f.caption.split(/\s+/).filter(Boolean).length : 1)),
        from,
        to,
        inner,
        win,
        lead,
      );
      cuts.forEach((c, k) => (starts[b.firstFrame + 1 + k] = c));
    }
  });

  // Huecos (trozos sin palabra encontrada): interpolar
  for (let i = 1; i < starts.length; i++) {
    if (!isNaN(starts[i])) continue;
    let j = i + 1;
    while (j < starts.length && isNaN(starts[j])) j++;
    const a = starts[i - 1];
    const b = j < starts.length ? starts[j] : duration;
    for (let k = i; k < j; k++) starts[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j - 1;
  }
  starts[0] = 0;
  for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i], starts[i - 1] + 0.2);
  for (let i = 0; i < starts.length; i++) starts[i] = Math.round(Math.min(Math.max(0, starts[i]), duration - 0.05) * 1000) / 1000;
  const durations = starts.map((s, i) => Math.max(0.05, (i + 1 < starts.length ? starts[i + 1] : duration) - s));

  return {
    starts,
    durations,
    beatStarts: beats.map((b) => starts[b.firstFrame] ?? 0),
    anchored: beats.length,
    audioDuration: duration,
    matchedWords,
    totalWords: tokens.length,
    confirmedByPauses,
    correctedByPauses,
  };
}
