import { applyOverrides, resolveColor, type FontKey, type Template } from "../dsl/template";
import type { Frame, ParsedScript, SlotRef, Subject, VisualState } from "../dsl/types";
import { getImage, imageFailed } from "./images";
import { applyCameraEffects, drawBurst, drawOverlayEffects, findEffect } from "./effects";
import { mascotDataURL } from "./mascot";

export interface RenderContext {
  script: ParsedScript;
  template: Template;
  assets: Record<string, string>;
  fonts: Record<FontKey, string>;
  placeholders: boolean;
}

const BASE_W = 1080;
const BASE_H = 1920;

const tplCache = new WeakMap<Template, Map<string, Template>>();

/** Plantilla UI → @estilo global → estilo: del fotograma */
export function frameTemplate(rc: RenderContext, frame: Frame | null): Template {
  const overrides = { ...rc.script.globalStyle, ...(frame?.state.style ?? {}) };
  const key = JSON.stringify(overrides);
  let m = tplCache.get(rc.template);
  if (!m) tplCache.set(rc.template, (m = new Map()));
  let t = m.get(key);
  if (!t) {
    t = applyOverrides(rc.template, overrides);
    m.set(key, t);
  }
  return t;
}

const isUrl = (s: string) => /^(https?:|data:|blob:|\/)/.test(s);

export function subjectSource(s: Subject | undefined, id: string | undefined, assets: Record<string, string>): string | null {
  if (s?.file) {
    if (assets[s.file]) return assets[s.file];
    if (isUrl(s.file)) return s.file;
  }
  if (id && assets[`sujeto:${id}`]) return assets[`sujeto:${id}`];
  return null;
}

export function resolveMascot(value: string, script: ParsedScript) {
  const [first, face2] = value.split(/\s+/);
  const def = script.poses[first];
  let base = def ? def.base : first;
  const face = face2 ?? def?.face ?? "feliz";
  if (def?.mirror) base = base === "apunta-izq" ? "apunta-der" : base === "apunta-der" ? "apunta-izq" : base;
  return { def, base, face };
}

export function mascotSource(value: string, rc: RenderContext, t: Template): string {
  const { def, base, face } = resolveMascot(value, rc.script);
  const a = rc.assets;
  const fromFile = def?.file ? a[def.file] ?? (isUrl(def.file) ? def.file : undefined) : undefined;
  return (
    a[`pose:${value}`] ??
    (def ? a[`pose:${def.id}`] : undefined) ??
    fromFile ??
    a[`pose:${base} ${face}`] ??
    a[`pose:${base}`] ??
    a["pose:*"] ??
    mascotDataURL(base, face, t.muneco)
  );
}

/** El trío se activa solo cuando hay algo en C (salvo layout: centro). */
export function effectiveLayout(st: VisualState): "duo" | "trio" | "centro" {
  if (st.layout === "centro") return "centro";
  return st.layout === "trio" || st.C ? "trio" : "duo";
}

export function slotTitle(ref: SlotRef | null, script: ParsedScript): string {
  if (!ref) return "";
  if (ref.title) return ref.title;
  if (ref.subjectId) return script.subjects[ref.subjectId]?.title ?? ref.subjectId;
  return "";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * Achica la fuente si alguna palabra no cabe en el ancho máximo
 * (así un título largo como "Hypersonic" no se sale de su columna). Deja ctx.font aplicado.
 */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontAt: (px: number) => string,
  size: number,
  maxW: number,
  enabled = true,
  minRatio = 0.45,
): number {
  ctx.font = fontAt(size);
  if (!enabled) return size;
  const widest = Math.max(0, ...text.split(/\s+/).map((w) => ctx.measureText(w).width));
  if (widest <= maxW || widest === 0) return size;
  const fitted = Math.max(size * minRatio, size * (maxW / widest) * 0.98);
  ctx.font = fontAt(fitted);
  return fitted;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
}

function drawContained(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, bw: number, bh: number) {
  const k = Math.min(bw / img.width, bh / img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

export function renderFrame(ctx: CanvasRenderingContext2D, frame: Frame | null, rc: RenderContext, W: number, H: number) {
  const t = frameTemplate(rc, frame);
  const sx = W / BASE_W;
  const sy = H / BASE_H;
  const s = Math.min(sx, sy);
  const font = (k: FontKey | string | undefined, fallback: FontKey) => rc.fonts[(k as FontKey) in rc.fonts ? (k as FontKey) : fallback];

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = resolveColor(frame?.state.background ?? undefined, t, t.lienzo.fondo);
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";

  if (!frame) {
    ctx.restore();
    return;
  }
  const st = frame.state;
  const script = rc.script;
  const seed = frame.index + 1;
  ctx.save();
  applyCameraEffects(ctx, st.effects, t, W, H, seed, frame.chunkIndex);

  // ── Slots A / B / C
  const layout = effectiveLayout(st);
  const im = t.imagenes;
  const slots: { key: "A" | "B" | "C"; ref: SlotRef | null; x: number; scale: number }[] =
    layout === "centro"
      ? [{ key: "A", ref: st.A, x: im.xCentro, scale: im.escalaCentro }]
      : layout === "trio"
        ? [
            { key: "A", ref: st.A, x: im.trioXA, scale: im.trioEscala },
            { key: "B", ref: st.B, x: im.trioXB, scale: im.trioEscala },
            { key: "C", ref: st.C, x: im.trioXC, scale: im.trioEscala },
          ]
        : [
            { key: "A", ref: st.A, x: im.xA, scale: 1 },
            { key: "B", ref: st.B, x: im.xB, scale: 1 },
          ];

  // Distancia entre columnas: los títulos nunca deben tocarse entre sí
  const xs = slots.map((sl) => sl.x).sort((a, b) => a - b);
  const colGap = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i])) : Infinity;

  for (const slot of slots) {
    if (!slot.ref) continue;
    const subj = slot.ref.subjectId ? script.subjects[slot.ref.subjectId] : undefined;
    const dim = st.focus === "ninguno" || (st.focus !== "ambos" && st.focus !== slot.key);
    ctx.globalAlpha = dim ? t.foco.opacidad : 1;

    // Título
    const tt = t.titulos;
    if (tt.visible) {
      let title = slotTitle(slot.ref, script);
      if (tt.mayusculas) title = title.toUpperCase();
      // Ni pisar al vecino ni salirse del borde del lienzo
      const edgeRoom = 2 * Math.min(slot.x, BASE_W - slot.x) - tt.margenBorde * 2;
      const titleMaxW = Math.min(tt.anchoMax * s * slot.scale, (colGap - tt.separacion) * sx, edgeRoom * sx);
      const scale = layout === "centro" ? tt.escalaCentro : layout === "trio" ? tt.escalaTrio : 1;
      ctx.letterSpacing = `${tt.tracking * s}px`;
      const ts = fitSize(ctx, title, (px) => `${tt.peso} ${px}px ${font(tt.fuente, "montserrat")}`, tt.tam * s * scale, titleMaxW, tt.ajustar, tt.tamMinimo);
      ctx.fillStyle = resolveColor(subj?.titleColor, t, resolveColor(tt.color, t, "#111"));
      ctx.textAlign = "center";
      const lines = wrap(ctx, title, titleMaxW);
      const lh = ts * tt.interlineado;
      const top = tt.y * sy - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, slot.x * sx, top + i * lh));
      ctx.letterSpacing = "0px";
    }

    // Imagen
    if (!t.imagenes.visible) continue;
    const cx = (slot.x + (subj?.dx ?? 0)) * sx;
    const cy = (t.imagenes.y + (subj?.dy ?? 0)) * sy;
    const k = slot.scale * (subj?.scale ?? 1);
    const bw = t.imagenes.ancho * s * k;
    const bh = t.imagenes.alto * s * k;
    const src = subjectSource(subj, slot.ref.subjectId, rc.assets);
    const img = getImage(src);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((((subj?.rotation ?? 0) + t.imagenes.rotacion) * Math.PI) / 180);
    if (img) drawContained(ctx, img, 0, 0, bw, bh);
    else if (rc.placeholders) {
      const mk = t.marcador;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, mk.radio * s);
      ctx.fillStyle = resolveColor(mk.fondo, t, "transparent");
      ctx.fill();
      ctx.setLineDash([mk.grosor * 4.5 * s, mk.grosor * 3.3 * s]);
      ctx.lineWidth = mk.grosor * s;
      ctx.strokeStyle = resolveColor(mk.borde, t, "#999");
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = resolveColor(mk.texto, t, "#777");
      ctx.font = `700 ${mk.tamEtiqueta * s}px ${font("inter", "inter")}`;
      ctx.letterSpacing = `${mk.tamEtiqueta * 0.14 * s}px`;
      ctx.fillText(imageFailed(src) ? `IMAGEN ${slot.key} · NO CARGA` : `IMAGEN ${slot.key}`, 0, -bh / 2 + mk.tamEtiqueta * 2 * s);
      ctx.letterSpacing = "0px";
      ctx.font = `400 ${mk.tamTexto * s}px ${font("inter", "inter")}`;
      const prompt = subj?.prompt ?? "Sin descripción. Agrega «imagen:» al sujeto.";
      const lh = mk.tamTexto * 1.33 * s;
      const pl = wrap(ctx, prompt, bw - mk.tamTexto * 2.5 * s).slice(0, 7);
      pl.forEach((l, i) => ctx.fillText(l, 0, -((pl.length - 1) * lh) / 2 + i * lh + lh / 2));
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ── Muñeco
  if (st.mascot && t.muneco.visible) {
    const img = getImage(mascotSource(st.mascot, rc, t));
    if (img) {
      const h = t.muneco.alto * s;
      const w = (img.width / img.height) * h;
      ctx.drawImage(img, t.muneco.x * sx - w / 2, t.muneco.y * sy - h / 2, w, h);
    }
  }

  // ── Rótulo central (trozo de la narración en modo auto, o texto fijo)
  if (frame.caption && t.texto.visible) {
    ctx.letterSpacing = `${t.texto.tracking * s}px`;
    const ts = fitSize(
      ctx,
      frame.caption,
      (px) => `${t.texto.peso} ${px}px ${font(t.texto.fuente, "montserrat")}`,
      t.texto.tam * s,
      t.texto.anchoMax * s,
      t.texto.ajustar,
      t.texto.tamMinimo,
    );
    ctx.textAlign = "center";
    const lines = wrap(ctx, frame.caption, t.texto.anchoMax * s);
    const lh = ts * t.texto.interlineado;
    const top = t.texto.y * sy - ((lines.length - 1) * lh) / 2;
    const burst = findEffect(st.effects, "destello");
    if (burst) {
      const mw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      drawBurst(ctx, burst, t, W / 2, t.texto.y * sy, mw, lines.length * lh, s, seed);
    }
    ctx.fillStyle = resolveColor(t.texto.color, t, "#111");
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
    ctx.letterSpacing = "0px";
  }

  // ── Textos extra
  for (const e of t.extra.visible ? Object.values(st.extras) : []) {
    const size = (e.size ?? t.extra.tam) * s;
    ctx.save();
    ctx.translate((e.x / 100) * W, (e.y / 100) * H);
    if (e.rotation) ctx.rotate((e.rotation * Math.PI) / 180);
    ctx.font = `${e.weight ?? t.extra.peso} ${size}px ${font(e.font, t.extra.fuente)}`;
    ctx.textAlign = e.align === "izq" ? "left" : e.align === "der" ? "right" : "center";
    const lines = e.text.split("\n");
    const lh = size * t.extra.interlineado;
    const y0 = -((lines.length - 1) * lh) / 2;
    if (e.bg) {
      const mw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const px = size * t.extra.fondoRelleno;
      const x0 = e.align === "izq" ? -px : e.align === "der" ? -mw - px : -mw / 2 - px;
      roundRect(ctx, x0, y0 - lh / 2 - px * 0.4, mw + px * 2, lines.length * lh + px * 0.8, size * t.extra.fondoRadio);
      ctx.fillStyle = resolveColor(e.bg, t, e.bg);
      ctx.fill();
    }
    ctx.fillStyle = resolveColor(e.color, t, resolveColor(t.extra.color, t, "#111"));
    lines.forEach((l, i) => ctx.fillText(l, 0, y0 + i * lh));
    ctx.restore();
  }

  ctx.restore(); // fin de temblor / zoom
  drawOverlayEffects(ctx, st.effects, t, W, H, seed);

  // ── Subtítulo
  if (frame.subtitle && t.subtitulo.visible) {
    const sb = t.subtitulo;
    const ts = sb.tam * s;
    ctx.font = `${sb.peso} ${ts}px ${font(sb.fuente, "inter")}`;
    const lines = wrap(ctx, frame.subtitle, (sb.anchoMax - sb.padX * 2) * s);
    const lh = ts * sb.interlineado;
    const mw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = mw + sb.padX * 2 * s;
    const bh = lines.length * lh + sb.padY * 2 * s;
    const bx = sb.alineacion === "centro" ? (W - bw) / 2 : sb.x * sx;
    const by = sb.yBase * sy - bh;
    ctx.globalAlpha = sb.opacidad;
    roundRect(ctx, bx, by, bw, bh, sb.radio * s);
    ctx.fillStyle = resolveColor(sb.fondo, t, "#6b6b6b");
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = resolveColor(sb.color, t, "#fff");
    ctx.textAlign = sb.alineacion === "centro" ? "center" : "left";
    const tx = sb.alineacion === "centro" ? W / 2 : bx + sb.padX * s;
    lines.forEach((l, i) => ctx.fillText(l, tx, by + sb.padY * s + lh / 2 + i * lh));
  }

  ctx.restore();
}

/** Fuentes de todas las imágenes que necesita el guion (para precargar antes de exportar). */
export function allSources(rc: RenderContext): string[] {
  const out = new Set<string>();
  for (const f of rc.script.frames) {
    const t = frameTemplate(rc, f);
    for (const ref of [f.state.A, f.state.B, f.state.C]) {
      if (!ref?.subjectId) continue;
      const src = subjectSource(rc.script.subjects[ref.subjectId], ref.subjectId, rc.assets);
      if (src) out.add(src);
    }
    if (f.state.mascot) out.add(mascotSource(f.state.mascot, rc, t));
  }
  return [...out];
}
