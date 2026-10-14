import { norm } from "./parser";
import type { Diagnostic } from "./types";

export const FONT_KEYS = ["montserrat", "inter", "anton", "bebas", "poppins", "archivo", "serif"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const FONT_LABELS: Record<FontKey, string> = {
  montserrat: "Montserrat",
  inter: "Inter",
  anton: "Anton",
  bebas: "Bebas Neue",
  poppins: "Poppins",
  archivo: "Archivo Black",
  serif: "Instrument Serif",
};

/**
 * Plantilla visual. Todas las medidas están en píxeles de un lienzo 1080×1920
 * y se escalan proporcionalmente si @formato cambia.
 */
export interface Template {
  lienzo: { fondo: string };
  paleta: { acento: string; tinta: string; suave: string };
  titulos: {
    fuente: FontKey;
    tam: number;
    peso: number;
    color: string;
    y: number;
    interlineado: number;
    tracking: number;
    mayusculas: boolean;
    anchoMax: number;
  };
  imagenes: { xA: number; xB: number; xCentro: number; y: number; ancho: number; alto: number; rotacion: number; escalaCentro: number };
  texto: { fuente: FontKey; tam: number; peso: number; color: string; y: number; anchoMax: number; tracking: number; interlineado: number };
  muneco: { x: number; y: number; alto: number; trazo: string; corbata: string; camisa: string; grosor: number };
  subtitulo: {
    fuente: FontKey;
    tam: number;
    peso: number;
    color: string;
    fondo: string;
    opacidad: number;
    radio: number;
    x: number;
    yBase: number;
    padX: number;
    padY: number;
    anchoMax: number;
    interlineado: number;
    alineacion: "izq" | "centro";
  };
  foco: { opacidad: number };
  extra: { fuente: FontKey; tam: number; peso: number; color: string };
}

export const DEFAULT_TEMPLATE: Template = {
  lienzo: { fondo: "#ffffff" },
  paleta: { acento: "#c62828", tinta: "#111111", suave: "#8a8a8a" },
  titulos: { fuente: "montserrat", tam: 78, peso: 800, color: "#111111", y: 300, interlineado: 1.0, tracking: -0.5, mayusculas: false, anchoMax: 470 },
  imagenes: { xA: 290, xB: 790, xCentro: 540, y: 600, ancho: 470, alto: 400, rotacion: 0, escalaCentro: 1.3 },
  texto: { fuente: "montserrat", tam: 56, peso: 800, color: "#111111", y: 960, anchoMax: 960, tracking: -0.3, interlineado: 1.1 },
  muneco: { x: 540, y: 1430, alto: 780, trazo: "#111111", corbata: "#c62828", camisa: "#ffffff", grosor: 7 },
  subtitulo: {
    fuente: "inter",
    tam: 41,
    peso: 400,
    color: "#ffffff",
    fondo: "#6b6b6b",
    opacidad: 0.85,
    radio: 18,
    x: 22,
    yBase: 1870,
    padX: 31,
    padY: 22,
    anchoMax: 790,
    interlineado: 1.28,
    alineacion: "izq",
  },
  foco: { opacidad: 0.25 },
  extra: { fuente: "montserrat", tam: 60, peso: 800, color: "#111111" },
};

export function cloneTemplate(t: Template): Template {
  return JSON.parse(JSON.stringify(t));
}

/** Rellena claves que falten (p. ej. plantillas guardadas con versiones anteriores) */
export function hydrateTemplate(t: Partial<Template> | null | undefined): Template {
  const base = cloneTemplate(DEFAULT_TEMPLATE) as unknown as Record<string, Record<string, unknown>>;
  if (!t) return base as unknown as Template;
  for (const [group, values] of Object.entries(t)) {
    if (base[group] && values && typeof values === "object") Object.assign(base[group], values);
  }
  return base as unknown as Template;
}

const GROUP_ALIASES: Record<string, string> = {
  titulo: "titulos",
  title: "titulos",
  imagen: "imagenes",
  img: "imagenes",
  rotulo: "texto",
  frase: "texto",
  personaje: "muneco",
  mascota: "muneco",
  sub: "subtitulo",
  subtitulos: "subtitulo",
  fondo: "lienzo",
};

/** Aplica overrides tipo "titulos.tam" = "80" sobre una copia de la plantilla. */
export function applyOverrides(
  t: Template,
  overrides: Record<string, string>,
  diag?: (d: Diagnostic) => void,
  line = 1,
): Template {
  const keys = Object.keys(overrides);
  if (!keys.length) return t;
  const out = cloneTemplate(t) as unknown as Record<string, Record<string, unknown>>;
  for (const rawKey of keys) {
    const [g0, k0] = norm(rawKey).split(".");
    const group = GROUP_ALIASES[g0] ?? g0;
    if (group === "lienzo" && !k0) {
      out.lienzo.fondo = overrides[rawKey];
      continue;
    }
    const target = out[group];
    const key = target && k0 ? Object.keys(target).find((k) => norm(k) === k0) : undefined;
    if (!target || !key) {
      diag?.({ line, level: "warn", msg: `Clave de estilo desconocida: "${rawKey}"` });
      continue;
    }
    const prev = target[key];
    const raw = overrides[rawKey];
    if (typeof prev === "number") {
      const n = parseFloat(raw.replace(",", "."));
      if (isFinite(n)) target[key] = n;
      else diag?.({ line, level: "warn", msg: `"${rawKey}" necesita un número` });
    } else if (typeof prev === "boolean") target[key] = ["si", "true", "on", "1"].includes(norm(raw));
    else target[key] = raw;
  }
  return out as unknown as Template;
}

/** Resuelve colores con nombre de la paleta: "acento", "tinta", "suave". */
export function resolveColor(c: string | undefined, t: Template, fallback: string): string {
  if (!c) return fallback;
  const k = norm(c);
  if (k in t.paleta) return t.paleta[k as keyof Template["paleta"]];
  return c;
}

/** Lista plana de todas las claves de estilo, para la referencia del lenguaje. */
export function styleKeys(): string[] {
  const out: string[] = [];
  for (const [g, vals] of Object.entries(DEFAULT_TEMPLATE)) for (const k of Object.keys(vals)) out.push(`${g}.${k}`);
  return out;
}
