/**
 * Muñeco comparativo dibujado en SVG (estilo "explainer" de línea negra con corbata).
 * Lienzo propio de 600×900. Se puede reemplazar por imágenes subidas por pose.
 */

type P = [number, number];
type HandKind = "point" | "palm" | "down" | "thumb";
interface Arm {
  s: P;
  e: P;
  w: P;
  hand: HandKind;
  lines?: boolean;
}

export interface MascotColors {
  trazo: string;
  corbata: string;
  camisa: string;
  grosor: number;
}

const SL: P = [246, 318];
const SR: P = [354, 318];

const POSES: Record<string, { L: Arm; R: Arm; mirror?: boolean; question?: boolean }> = {
  neutral: {
    L: { s: SL, e: [220, 420], w: [212, 515], hand: "down" },
    R: { s: SR, e: [380, 420], w: [388, 515], hand: "down" },
  },
  "apunta-izq": {
    L: { s: SL, e: [172, 258], w: [122, 182], hand: "point", lines: true },
    R: { s: SR, e: [432, 400], w: [500, 392], hand: "palm", lines: true },
  },
  "apunta-der": {
    L: { s: SL, e: [172, 258], w: [122, 182], hand: "point", lines: true },
    R: { s: SR, e: [432, 400], w: [500, 392], hand: "palm", lines: true },
    mirror: true,
  },
  "apunta-centro": {
    L: { s: SL, e: [178, 400], w: [112, 404], hand: "palm", lines: true },
    R: { s: SR, e: [440, 250], w: [438, 118], hand: "point", lines: true },
  },
  duda: {
    L: { s: SL, e: [186, 410], w: [118, 418], hand: "palm", lines: true },
    R: { s: SR, e: [414, 410], w: [482, 418], hand: "palm", lines: true },
    question: true,
  },
  presenta: {
    L: { s: SL, e: [170, 360], w: [104, 300], hand: "palm", lines: true },
    R: { s: SR, e: [430, 360], w: [496, 300], hand: "palm", lines: true },
  },
  pulgar: {
    L: { s: SL, e: [220, 420], w: [212, 515], hand: "down" },
    R: { s: SR, e: [440, 410], w: [430, 320], hand: "thumb", lines: true },
  },
};

const FACES: Record<string, string> = {
  feliz: `
    <path d="M250 134 Q267 120 284 131" class="l"/><path d="M316 131 Q333 120 350 134" class="l"/>
    <ellipse cx="268" cy="164" rx="9" ry="14" class="f"/><ellipse cx="332" cy="164" rx="9" ry="14" class="f"/>
    <path d="M252 198 Q300 268 348 198 Q300 214 252 198 Z" class="f"/>
    <path d="M262 203 Q300 214 338 203 L334 213 Q300 222 266 213 Z" fill="#fff"/>
    <path d="M282 238 Q300 226 318 238 Q300 248 282 238 Z" fill="#c62828"/>`,
  picaro: `
    <path d="M248 132 L288 150" class="l"/><path d="M312 150 L352 132" class="l"/>
    <ellipse cx="270" cy="168" rx="9" ry="10" class="f"/><ellipse cx="330" cy="168" rx="9" ry="10" class="f"/>
    <path d="M262 206 Q300 236 344 196" class="l"/>`,
  duda: `
    <path d="M250 128 Q267 114 284 124" class="l"/><path d="M316 142 L350 150" class="l"/>
    <ellipse cx="268" cy="164" rx="9" ry="13" class="f"/><ellipse cx="332" cy="168" rx="9" ry="11" class="f"/>
    <ellipse cx="302" cy="220" rx="9" ry="11" class="f"/>`,
  sorpresa: `
    <path d="M250 122 Q267 106 284 118" class="l"/><path d="M316 118 Q333 106 350 122" class="l"/>
    <ellipse cx="268" cy="160" rx="11" ry="17" class="f"/><ellipse cx="332" cy="160" rx="11" ry="17" class="f"/>
    <ellipse cx="300" cy="222" rx="17" ry="22" class="f"/>`,
  serio: `
    <path d="M252 140 L284 140" class="l"/><path d="M316 140 L348 140" class="l"/>
    <ellipse cx="268" cy="166" rx="8" ry="10" class="f"/><ellipse cx="332" cy="166" rx="8" ry="10" class="f"/>
    <path d="M276 216 L324 216" class="l"/>`,
  triste: `
    <path d="M252 142 L284 128" class="l"/><path d="M316 128 L348 142" class="l"/>
    <ellipse cx="268" cy="166" rx="8" ry="11" class="f"/><ellipse cx="332" cy="166" rx="8" ry="11" class="f"/>
    <path d="M272 226 Q300 202 328 226" class="l"/>`,
};

export const MASCOT_POSES = Object.keys(POSES);
export const MASCOT_FACES = Object.keys(FACES);

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const dirOf = (a: P, b: P): P => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
const rot = (d: P, a: number): P => [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];
const f = (n: number) => n.toFixed(1);

function tube(d: string, width: number, c: MascotColors): string {
  return `<path d="${d}" fill="none" stroke="${c.trazo}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${c.camisa}" stroke-width="${Math.max(2, width - c.grosor * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function motionLines(at: P, d: P, c: MascotColors): string {
  return [-0.75, 0, 0.75]
    .map((a) => {
      const dd = rot(d, a);
      const p1 = add(at, mul(dd, 22));
      const p2 = add(at, mul(dd, a === 0 ? 50 : 42));
      return `<path d="M${f(p1[0])} ${f(p1[1])} L${f(p2[0])} ${f(p2[1])}" stroke="${c.trazo}" stroke-width="${c.grosor * 0.8}" stroke-linecap="round"/>`;
    })
    .join("");
}

function arm(a: Arm, c: MascotColors): string {
  let out = tube(`M${a.s[0]} ${a.s[1]} Q${a.e[0]} ${a.e[1]} ${a.w[0]} ${a.w[1]}`, 34, c);
  const d = dirOf(a.e, a.w);
  const ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  const sw = c.grosor;
  if (a.hand === "point") {
    const fist = add(a.w, mul(d, 12));
    const tip = add(fist, mul(d, 52));
    out += `<circle cx="${f(fist[0])}" cy="${f(fist[1])}" r="21" fill="${c.camisa}" stroke="${c.trazo}" stroke-width="${sw}"/>`;
    out += tube(`M${f(fist[0])} ${f(fist[1])} L${f(tip[0])} ${f(tip[1])}`, 19, c);
    if (a.lines) out += motionLines(tip, d, c);
  } else if (a.hand === "palm") {
    const ctr = add(a.w, mul(d, 24));
    const thumbBase = add(a.w, mul(rot(d, -1.2), 12));
    const thumbTip = add(thumbBase, mul(rot(d, -0.6), 26));
    out += tube(`M${f(thumbBase[0])} ${f(thumbBase[1])} L${f(thumbTip[0])} ${f(thumbTip[1])}`, 16, c);
    out += `<ellipse cx="${f(ctr[0])}" cy="${f(ctr[1])}" rx="32" ry="14" transform="rotate(${f(ang)} ${f(ctr[0])} ${f(ctr[1])})" fill="${c.camisa}" stroke="${c.trazo}" stroke-width="${sw}"/>`;
    if (a.lines) out += motionLines(add(ctr, mul(d, 20)), rot(d, -0.5), c);
  } else if (a.hand === "thumb") {
    const fist = add(a.w, mul(d, 10));
    const tip: P = [fist[0], fist[1] - 50];
    out += tube(`M${f(fist[0])} ${f(fist[1])} L${f(tip[0])} ${f(tip[1])}`, 19, c);
    out += `<rect x="${f(fist[0] - 24)}" y="${f(fist[1] - 20)}" width="48" height="42" rx="16" fill="${c.camisa}" stroke="${c.trazo}" stroke-width="${sw}"/>`;
    if (a.lines) out += motionLines(tip, [0, -1], c);
  } else {
    const ctr = add(a.w, mul(d, 10));
    out += `<circle cx="${f(ctr[0])}" cy="${f(ctr[1])}" r="19" fill="${c.camisa}" stroke="${c.trazo}" stroke-width="${sw}"/>`;
  }
  return out;
}

export function mascotSVG(pose: string, face: string, c: MascotColors): string {
  const p = POSES[pose] ?? POSES.neutral;
  const faceSvg = FACES[face] ?? FACES.feliz;
  const sw = c.grosor;
  const body = `
  <g stroke="${c.trazo}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">
    <path d="M232 545 L368 545 L374 610 L354 842 L318 842 L303 650 L297 650 L282 842 L246 842 L226 610 Z" fill="${c.camisa}"/>
    <path d="M248 562 Q256 588 252 610" fill="none"/><path d="M352 562 Q344 588 348 610" fill="none"/>
    <ellipse cx="252" cy="858" rx="40" ry="13" fill="${c.camisa}"/>
    <ellipse cx="348" cy="858" rx="40" ry="13" fill="${c.camisa}"/>
    <path d="M240 300 Q300 284 360 300 L368 548 L232 548 Z" fill="${c.camisa}"/>
    <path d="M232 548 L368 548" fill="none"/>
    <path d="M291 306 L309 306 L306 324 L294 324 Z" fill="${c.corbata}" stroke-width="${sw * 0.7}"/>
    <path d="M294 324 L306 324 L320 470 L300 494 L280 470 Z" fill="${c.corbata}" stroke-width="${sw * 0.7}"/>
    <path d="M264 290 L300 304 L284 330 Z" fill="${c.camisa}" stroke-width="${sw * 0.7}"/>
    <path d="M336 290 L300 304 L316 330 Z" fill="${c.camisa}" stroke-width="${sw * 0.7}"/>
  </g>
  ${arm(p.L, c)}${arm(p.R, c)}
  <g stroke="${c.trazo}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="300" cy="172" r="90" fill="${c.camisa}"/>
    <path d="M278 84 Q280 64 296 54" fill="none"/><path d="M298 82 Q304 60 324 52" fill="none"/>
    <path d="M318 86 Q334 70 352 72" fill="none"/><path d="M262 92 Q258 76 266 66" fill="none"/>
  </g>
  <g stroke="${c.trazo}" fill="${c.trazo}" stroke-width="${sw * 0.9}" stroke-linecap="round">
    <style>.l{fill:none}.f{stroke:none}</style>
    ${faceSvg}
  </g>
  ${
    p.question
      ? `<path d="M392 62 Q394 34 420 34 Q446 34 446 58 Q446 76 424 84 L424 104" fill="none" stroke="${c.trazo}" stroke-width="${sw}" stroke-linecap="round"/><circle cx="424" cy="124" r="${sw * 0.9}" fill="${c.trazo}"/>`
      : ""
  }`;
  const inner = p.mirror ? `<g transform="translate(600 0) scale(-1 1)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">${inner}</svg>`;
}

export function mascotDataURL(pose: string, face: string, c: MascotColors): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(mascotSVG(pose, face, c));
}
