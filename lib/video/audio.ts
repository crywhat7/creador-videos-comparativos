/** Decodificación y análisis del audio de la voz (todo en el navegador). */

export interface Silence {
  start: number;
  end: number;
}

export interface AudioAnalysis {
  duration: number;
  /** primer y último instante con voz */
  speechStart: number;
  speechEnd: number;
  /** pausas dentro de la voz (≥ 0.1 s) */
  silences: Silence[];
  /** volumen RMS normalizado (0..1) cada `hop` segundos, para dibujar la onda */
  envelope: Float32Array;
  hop: number;
}

export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(data);
  } finally {
    ctx.close();
  }
}

function percentile(sorted: Float32Array, p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

/**
 * Detecta dónde hay voz y dónde hay pausas, con un umbral adaptativo
 * (sirve igual para audios más fuertes o más suaves).
 */
export function analyzeAudio(buf: AudioBuffer, hop = 0.01, minSilence = 0.1): AudioAnalysis {
  const sr = buf.sampleRate;
  const win = Math.max(1, Math.round(hop * sr));
  const n = Math.ceil(buf.length / win);
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const a = i * win;
    const b = Math.min(buf.length, a + win);
    for (let j = a; j < b; j++) {
      let v = 0;
      for (const ch of channels) v += ch[j];
      v /= channels.length;
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / Math.max(1, b - a));
  }

  const sorted = Float32Array.from(rms).sort();
  const floor = percentile(sorted, 0.1);
  const speech = percentile(sorted, 0.8);
  const peak = percentile(sorted, 0.995) || 1;
  const thr = floor + Math.max(0.002, (speech - floor) * 0.1);

  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (rms[i] >= thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  const speechStart = first < 0 ? 0 : first * hop;
  const speechEnd = last < 0 ? buf.duration : Math.min(buf.duration, (last + 1) * hop);

  const silences: Silence[] = [];
  let run = -1;
  for (let i = Math.max(0, first); i <= last; i++) {
    const quiet = rms[i] < thr;
    if (quiet && run < 0) run = i;
    if (!quiet && run >= 0) {
      if ((i - run) * hop >= minSilence) silences.push({ start: run * hop, end: i * hop });
      run = -1;
    }
  }

  const envelope = new Float32Array(n);
  for (let i = 0; i < n; i++) envelope[i] = Math.min(1, rms[i] / peak);

  return { duration: buf.duration, speechStart, speechEnd, silences, envelope, hop };
}
