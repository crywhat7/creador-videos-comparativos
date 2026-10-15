"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedScript } from "@/lib/dsl/types";
import { analyzeAudio, decodeAudio, type AudioAnalysis } from "@/lib/video/audio";
import { alignToAudio, type SyncResult } from "@/lib/video/sync";
import { alignWithTranscript, parseTranscript, type Transcript, type TranscriptSync } from "@/lib/video/transcript";

export interface Voice {
  name: string;
  url: string; // data URL (sirve para <audio> y queda guardada en el proyecto)
  buffer: AudioBuffer;
  analysis: AudioAnalysis;
}

export interface VoiceSync {
  voice: Voice | null;
  loading: boolean;
  error: string | null;
  setAudioFile: (f: File) => Promise<void>;
  clearAudio: () => void;
  timesText: string;
  setTimesText: (t: string) => void;
  transcript: Transcript | null;
  transcriptError: string | null;
  lead: number;
  setLead: (n: number) => void;
  sync: SyncResult | TranscriptSync | null;
  method: "tiempos" | "pausas" | null;
  /** tiempos pegados que no coinciden con el audio (se usó el ajuste por pausas) */
  rejected: TranscriptSync | null;
  forceTimes: boolean;
  setForceTimes: (v: boolean) => void;
}

const K_AUDIO = "voz:audio";
const K_NAME = "voz:nombre";
const K_TIMES = "voz:tiempos";

async function dataUrlToArrayBuffer(url: string) {
  return (await fetch(url)).arrayBuffer();
}

function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/**
 * Audio de la voz + tiempos opcionales → tiempo real de cada imagen.
 * Se guarda dentro de los recursos del proyecto (claves voz:*).
 */
export function useVoiceSync(script: ParsedScript, assets: Record<string, string>, onAsset: (k: string, v: string | null) => void): VoiceSync {
  const [voice, setVoice] = useState<Voice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState(0.05);
  const loadedUrl = useRef<string | null>(null);
  const timesText = assets[K_TIMES] ?? "";

  // Restaurar el audio guardado al abrir el proyecto
  const savedUrl = assets[K_AUDIO];
  const savedName = assets[K_NAME];
  useEffect(() => {
    if (!savedUrl || loadedUrl.current === savedUrl) return;
    loadedUrl.current = savedUrl;
    let alive = true;
    dataUrlToArrayBuffer(savedUrl)
      .then(decodeAudio)
      .then((buffer) => {
        if (alive) setVoice({ name: savedName ?? "audio", url: savedUrl, buffer, analysis: analyzeAudio(buffer) });
      })
      .catch(() => alive && setError("No se pudo leer el audio guardado."));
    return () => {
      alive = false;
    };
  }, [savedUrl, savedName]);

  const setAudioFile = async (f: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await decodeAudio(await f.arrayBuffer());
      const url = await fileToDataURL(f);
      loadedUrl.current = url;
      setVoice({ name: f.name, url, buffer, analysis: analyzeAudio(buffer) });
      onAsset(K_AUDIO, url);
      onAsset(K_NAME, f.name);
    } catch {
      setError("No se pudo leer ese audio. Prueba con MP3, WAV, M4A u OGG.");
    } finally {
      setLoading(false);
    }
  };

  const clearAudio = () => {
    loadedUrl.current = null;
    setVoice(null);
    onAsset(K_AUDIO, null);
    onAsset(K_NAME, null);
  };

  const parsed = useMemo(() => {
    if (!timesText.trim()) return { tr: null, err: null };
    try {
      return { tr: parseTranscript(timesText), err: null };
    } catch (e) {
      return { tr: null, err: e instanceof Error ? e.message : "No se pudieron leer los tiempos." };
    }
  }, [timesText]);

  const [forceTimes, setForceTimes] = useState(false);

  // Se calculan ambos ajustes: si los tiempos pegados no coinciden con el audio real
  // (típico de tiempos estimados por una IA), se usa el ajuste por pausas.
  const result = useMemo(() => {
    if (!voice || !script.frames.length) return { sync: null, method: null, rejected: null };
    const byPauses = alignToAudio(script, voice.analysis, lead);
    if (!parsed.tr) return { sync: byPauses, method: "pausas" as const, rejected: null };
    const byTimes = alignWithTranscript(script, parsed.tr, voice.analysis, voice.analysis.duration, lead);
    const lines = Math.max(1, script.beats.length - 1);
    const reliable = parsed.tr.precision === "palabra" || byTimes.confirmedByPauses >= lines * 0.5;
    if (reliable || forceTimes) return { sync: byTimes, method: "tiempos" as const, rejected: null };
    return { sync: byPauses, method: "pausas" as const, rejected: byTimes };
  }, [voice, script, parsed.tr, lead, forceTimes]);

  return {
    voice,
    loading,
    error,
    setAudioFile,
    clearAudio,
    timesText,
    setTimesText: (t) => onAsset(K_TIMES, t.trim() ? t : null),
    transcript: parsed.tr,
    transcriptError: parsed.err,
    lead,
    setLead,
    sync: result.sync,
    method: result.method,
    rejected: result.rejected,
    forceTimes,
    setForceTimes,
  };
}
