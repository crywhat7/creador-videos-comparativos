import { resolveColor, type Template } from "../dsl/template";
import type { Effect } from "../dsl/types";

/** PRNG determinista: la misma imagen siempre se exporta igual. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (v: string | undefined, d: number) => {
  const n = v === undefined ? NaN : parseFloat(v.replace(",", "."));
  return isFinite(n) ? n : d;
};

export const findEffect = (fx: Effect[], name: string) => fx.find((e) => e.name === name);

/** Transformación de toda la composición (temblor / zoom) */
export function applyCameraEffects(ctx: CanvasRenderingContext2D, fx: Effect[], t: Template, W: number, H: number, seed: number, chunkIndex: number) {
  const zoom = findEffect(fx, "zoom");
  const shake = findEffect(fx, "temblor");
  if (!zoom && !shake) return;
  ctx.translate(W / 2, H / 2);
  if (zoom) {
    const k = zoom.opts.escala ? num(zoom.opts.escala, 1.08) : 1 + num(zoom.opts.paso, t.efectos.zoomPaso) * (chunkIndex + 1);
    ctx.scale(k, k);
  }
  if (shake) {
    const r = rng(seed * 7919);
    const f = num(shake.opts.fuerza, t.efectos.temblorFuerza);
    ctx.rotate(((r() - 0.5) * 1.6 * f * Math.PI) / 180);
    ctx.translate((r() - 0.5) * 16 * f * (W / 1080), (r() - 0.5) * 16 * f * (W / 1080));
  }
  ctx.translate(-W / 2, -H / 2);
}

/** Estallido de cómic detrás del rótulo central */
export function drawBurst(ctx: CanvasRenderingContext2D, e: Effect, t: Template, cx: number, cy: number, w: number, h: number, s: number, seed: number) {
  const r = rng(seed * 104729);
  const spikes = Math.round(num(e.opts.picos, t.efectos.destelloPicos));
  const rx = w / 2 + 70 * s;
  const ry = h / 2 + 60 * s;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 === 0 ? 1 + r() * 0.28 : 0.74 + r() * 0.08;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = resolveColor(e.opts.color, t, resolveColor(t.efectos.destelloColor, t, "#ffd23f"));
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = num(e.opts.grosor, t.efectos.destelloGrosor) * s;
  ctx.strokeStyle = resolveColor(e.opts.trazo, t, resolveColor(t.efectos.destelloTrazo, t, "#111"));
  ctx.stroke();
  ctx.restore();
}

/** Efectos que se dibujan por encima de la composición */
export function drawOverlayEffects(ctx: CanvasRenderingContext2D, fx: Effect[], t: Template, W: number, H: number, seed: number) {
  const s = Math.min(W / 1080, H / 1920);
  const E = t.efectos;

  const trama = findEffect(fx, "trama");
  if (trama) {
    ctx.save();
    ctx.fillStyle = resolveColor(trama.opts.color, t, resolveColor(E.tramaColor, t, "#111"));
    ctx.globalAlpha = num(trama.opts.opacidad, E.tramaOpacidad);
    const step = num(trama.opts.paso, E.tramaPaso) * s;
    const reach = num(trama.opts.alcance, E.tramaAlcance);
    const corners: [number, number][] = [
      [0, 0],
      [W, H],
    ];
    for (const [ox, oy] of corners) {
      const maxD = Math.hypot(W, H) * reach;
      for (let y = 0; y <= H; y += step) {
        for (let x = 0; x <= W; x += step) {
          const d = Math.hypot(x - ox, y - oy);
          if (d > maxD) continue;
          const rr = (1 - d / maxD) * step * 0.48;
          ctx.beginPath();
          ctx.arc(x + ((y / step) % 2 ? step / 2 : 0), y, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  const lineas = findEffect(fx, "lineas-anime");
  if (lineas) {
    const r = rng(seed * 15485863);
    const n = Math.round(num(lineas.opts.cantidad, E.lineasCantidad));
    const hole = num(lineas.opts.hueco, E.lineasHueco);
    const thick = num(lineas.opts.grosor, E.lineasGrosor);
    const cx = (num(lineas.opts.x, 50) / 100) * W;
    const cy = (num(lineas.opts.y, 50) / 100) * H;
    const far = Math.hypot(W, H);
    ctx.save();
    ctx.fillStyle = resolveColor(lineas.opts.color, t, resolveColor(E.lineasColor, t, "#111"));
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const width = (0.004 + r() * 0.014) * thick;
      // radio interior sobre una elipse proporcional al lienzo, con variación
      const ir = hole * (0.85 + r() * 0.45);
      const ix = cx + Math.cos(a) * (W / 2) * ir;
      const iy = cy + Math.sin(a) * (H / 2) * ir;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(cx + Math.cos(a - width) * far, cy + Math.sin(a - width) * far);
      ctx.lineTo(cx + Math.cos(a + width) * far, cy + Math.sin(a + width) * far);
      ctx.closePath();
      ctx.globalAlpha = 0.55 + r() * 0.45;
      ctx.fill();
    }
    ctx.restore();
  }

  const vel = findEffect(fx, "velocidad");
  if (vel) {
    const r = rng(seed * 32452843);
    const n = Math.round(num(vel.opts.cantidad, E.velocidadCantidad));
    const margin = num(vel.opts.ancho, E.velocidadAncho) * W;
    ctx.save();
    ctx.fillStyle = resolveColor(vel.opts.color, t, resolveColor(E.velocidadColor, t, "#111"));
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const y = r() * H;
      const len = margin * (0.35 + r() * 0.75);
      const th = (2 + r() * 7) * s;
      const x0 = left ? -10 : W - len + 10;
      ctx.globalAlpha = 0.35 + r() * 0.6;
      ctx.beginPath();
      // forma afilada hacia el centro
      if (left) {
        ctx.moveTo(x0, y - th / 2);
        ctx.lineTo(x0 + len, y);
        ctx.lineTo(x0, y + th / 2);
      } else {
        ctx.moveTo(x0 + len, y - th / 2);
        ctx.lineTo(x0, y);
        ctx.lineTo(x0 + len, y + th / 2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  const vin = findEffect(fx, "vineta");
  if (vin) {
    const col = resolveColor(vin.opts.color, t, resolveColor(E.vinetaColor, t, "#000"));
    const f = num(vin.opts.fuerza, E.vinetaFuerza);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, col);
    ctx.save();
    ctx.globalAlpha = Math.min(1, f * 2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const borde = findEffect(fx, "borde");
  if (borde) {
    const g = num(borde.opts.grosor, E.bordeGrosor) * s;
    const rad = num(borde.opts.radio, E.bordeRadio) * s;
    ctx.save();
    ctx.strokeStyle = resolveColor(borde.opts.color, t, resolveColor(E.bordeColor, t, "#c62828"));
    ctx.lineWidth = g;
    ctx.beginPath();
    ctx.roundRect(g / 2, g / 2, W - g, H - g, rad);
    ctx.stroke();
    if (borde.opts.doble) {
      ctx.lineWidth = Math.max(2, g * 0.18);
      ctx.beginPath();
      ctx.roundRect(g * 1.6, g * 1.6, W - g * 3.2, H - g * 3.2, Math.max(0, rad - g));
      ctx.stroke();
    }
    ctx.restore();
  }
}
