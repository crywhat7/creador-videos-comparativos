import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { preloadImages } from "../render/images";
import { allSources, renderFrame, type RenderContext } from "../render/renderer";
import type { SyncResult } from "./sync";

export interface RenderOptions {
  rc: RenderContext;
  sync: SyncResult;
  audio: AudioBuffer;
  fps?: number;
  onProgress?: (p: number, stage: string) => void;
  signal?: AbortSignal;
}

export function videoSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Se fuerza el codificador por SOFTWARE de Chrome (OpenH264). El de hardware de Windows
 * (Media Foundation) genera H.264 con NAL poco comunes y descarta cuadros en escenas
 * estáticas: el resultado no se reproduce en el Reproductor de Windows ni en varias apps.
 * Constrained Baseline es el perfil que reproduce cualquier aparato.
 */
async function pickVideoConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
  const base = { width, height, bitrate: 8_000_000, bitrateMode: "variable", framerate: fps, latencyMode: "quality", avc: { format: "avc" } } as const;
  const candidates: VideoEncoderConfig[] = [
    { ...base, codec: "avc1.42e028", hardwareAcceleration: "prefer-software" }, // Constrained Baseline 4.0
    { ...base, codec: "avc1.42e032", hardwareAcceleration: "prefer-software" }, // Constrained Baseline 5.0
    { ...base, codec: "avc1.4d0028", hardwareAcceleration: "prefer-software" }, // Main 4.0
    { ...base, codec: "avc1.42e028" }, // último recurso: lo que tenga el navegador
  ];
  for (const cfg of candidates) {
    const res = await VideoEncoder.isConfigSupported(cfg);
    if (res.supported) return cfg;
  }
  throw new Error("Este navegador no puede codificar H.264. Usa Chrome o Edge actualizados.");
}

async function resample(buf: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (buf.sampleRate === rate) return buf;
  const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * rate), rate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

async function pickAudioConfig(buf: AudioBuffer): Promise<{ cfg: AudioEncoderConfig; codec: "aac" | "opus"; buffer: AudioBuffer }> {
  const channels = Math.min(2, buf.numberOfChannels);
  for (const rate of [buf.sampleRate, 48000, 44100]) {
    const cfg: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: channels, bitrate: 192_000 };
    if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, codec: "aac", buffer: await resample(buf, rate) };
  }
  const cfg: AudioEncoderConfig = { codec: "opus", sampleRate: 48000, numberOfChannels: channels, bitrate: 160_000 };
  if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, codec: "opus", buffer: await resample(buf, 48000) };
  throw new Error("Este navegador no puede codificar el audio. Usa Chrome o Edge actualizados.");
}

/** Genera el MP4 final (H.264 + AAC) con las imágenes sincronizadas al audio. */
export async function renderVideo({ rc, sync, audio, fps = 30, onProgress, signal }: RenderOptions): Promise<Blob> {
  if (!videoSupported()) throw new Error("Tu navegador no permite crear video. Usa Chrome o Edge actualizados.");
  const { ancho: W, alto: H } = rc.script.meta;
  const frames = rc.script.frames;

  onProgress?.(0, "Cargando imágenes");
  await document.fonts.ready;
  await preloadImages(allSources(rc));

  const vcfg = await pickVideoConfig(W, H, fps);
  const acfg = await pickAudioConfig(audio);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    audio: { codec: acfg.codec, numberOfChannels: acfg.cfg.numberOfChannels, sampleRate: acfg.cfg.sampleRate },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let failure: unknown = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
  venc.configure(vcfg);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const duration = sync.audioDuration;
  const total = Math.max(1, Math.ceil(duration * fps));
  const usPerFrame = 1e6 / fps;
  let current = -1;
  let k = 0;
  onProgress?.(0.02, "Creando video");
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    if (failure) throw failure;
    const t = i / fps;
    while (k + 1 < sync.starts.length && sync.starts[k + 1] <= t) k++;
    const changed = k !== current;
    if (changed) {
      renderFrame(ctx, frames[k] ?? null, rc, W, H);
      current = k;
    }
    const vf = new VideoFrame(canvas, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
    venc.encode(vf, { keyFrame: changed || i % (fps * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 6) await tick();
    if (i % 15 === 0) {
      onProgress?.(0.02 + (i / total) * 0.85, "Creando video");
      await tick();
    }
  }
  await venc.flush();
  venc.close();

  onProgress?.(0.88, "Agregando la voz");
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
  aenc.configure(acfg.cfg);
  const buf = acfg.buffer;
  const ch = acfg.cfg.numberOfChannels;
  const size = 4096;
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
  for (let off = 0; off < buf.length; off += size) {
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    const n = Math.min(size, buf.length - off);
    const data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) data.set(chans[c].subarray(off, off + n), c * n);
    const ad = new AudioData({
      format: "f32-planar",
      sampleRate: buf.sampleRate,
      numberOfFrames: n,
      numberOfChannels: ch,
      timestamp: Math.round((off / buf.sampleRate) * 1e6),
      data,
    });
    aenc.encode(ad);
    ad.close();
    while (aenc.encodeQueueSize > 20) await tick();
  }
  await aenc.flush();
  aenc.close();
  if (failure) throw failure;

  onProgress?.(0.98, "Empaquetando MP4");
  muxer.finalize();
  onProgress?.(1, "Listo");
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
