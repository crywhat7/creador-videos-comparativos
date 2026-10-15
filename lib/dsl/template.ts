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
    visible: boolean;
    fuente: FontKey;
    tam: number;
    peso: number;
    color: string;
    y: number;
    interlineado: number;
    tracking: number;
    mayusculas: boolean;
    anchoMax: number;
    /** achicar la letra si una palabra no cabe */
    ajustar: boolean;
    /** tamaño mínimo al achicar (proporción del tamaño original) */
    tamMinimo: number;
    /** espacio mínimo entre títulos vecinos (px) */
    separacion: number;
    /** margen mínimo contra el borde del lienzo (px) */
    margenBorde: number;
    /** escala del título con layout centro */
    escalaCentro: number;
    /** escala del título con tres sujetos */
    escalaTrio: number;
  };
  imagenes: {
    visible: boolean;
    xA: number;
    xB: number;
    xCentro: number;
    y: number;
    ancho: number;
    alto: number;
    rotacion: number;
    escalaCentro: number;
    trioXA: number;
    trioXB: number;
    trioXC: number;
    trioEscala: number;
  };
  marcador: {
    fondo: string;
    borde: string;
    texto: string;
    radio: number;
    grosor: number;
    tamEtiqueta: number;
    tamTexto: number;
  };
  texto: {
    visible: boolean;
    fuente: FontKey;
    tam: number;
    peso: number;
    color: string;
    y: number;
    anchoMax: number;
    tracking: number;
    interlineado: number;
    ajustar: boolean;
    tamMinimo: number;
  };
  muneco: { visible: boolean; x: number; y: number; alto: number; trazo: string; corbata: string; camisa: string; grosor: number };
  subtitulo: {
    visible: boolean;
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
  extra: { visible: boolean; fuente: FontKey; tam: number; peso: number; color: string; interlineado: number; fondoRelleno: number; fondoRadio: number };
  efectos: {
    lineasColor: string;
    lineasCantidad: number;
    lineasHueco: number;
    lineasGrosor: number;
    velocidadColor: string;
    velocidadCantidad: number;
    velocidadAncho: number;
    destelloColor: string;
    destelloTrazo: string;
    destelloPicos: number;
    destelloGrosor: number;
    bordeColor: string;
    bordeGrosor: number;
    bordeRadio: number;
    vinetaColor: string;
    vinetaFuerza: number;
    tramaColor: string;
    tramaOpacidad: number;
    tramaPaso: number;
    tramaAlcance: number;
    temblorFuerza: number;
    zoomPaso: number;
  };
}

export const DEFAULT_TEMPLATE: Template = {
  lienzo: { fondo: "#ffffff" },
  paleta: { acento: "#c62828", tinta: "#111111", suave: "#8a8a8a" },
  titulos: {
    visible: true,
    fuente: "montserrat",
    tam: 78,
    peso: 800,
    color: "#111111",
    y: 300,
    interlineado: 1.0,
    tracking: -0.5,
    mayusculas: false,
    anchoMax: 470,
    ajustar: true,
    tamMinimo: 0.45,
    separacion: 56,
    margenBorde: 24,
    escalaCentro: 1.1,
    escalaTrio: 0.81,
  },
  imagenes: { visible: true, xA: 290, xB: 790, xCentro: 540, y: 600, ancho: 470, alto: 400, rotacion: 0, escalaCentro: 1.3, trioXA: 190, trioXB: 540, trioXC: 890, trioEscala: 0.68 },
  marcador: { fondo: "rgba(17,17,17,0.04)", borde: "rgba(17,17,17,0.25)", texto: "rgba(17,17,17,0.45)", radio: 28, grosor: 3, tamEtiqueta: 22, tamTexto: 24 },
  texto: { visible: true, fuente: "montserrat", tam: 56, peso: 800, color: "#111111", y: 960, anchoMax: 960, tracking: -0.3, interlineado: 1.1, ajustar: true, tamMinimo: 0.45 },
  muneco: { visible: true, x: 540, y: 1430, alto: 780, trazo: "#111111", corbata: "#c62828", camisa: "#ffffff", grosor: 7 },
  subtitulo: {
    visible: true,
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
  extra: { visible: true, fuente: "montserrat", tam: 60, peso: 800, color: "#111111", interlineado: 1.1, fondoRelleno: 0.45, fondoRadio: 0.3 },
  efectos: {
    lineasColor: "#111111",
    lineasCantidad: 120,
    lineasHueco: 0.62,
    lineasGrosor: 1,
    velocidadColor: "#111111",
    velocidadCantidad: 46,
    velocidadAncho: 0.26,
    destelloColor: "#ffd23f",
    destelloTrazo: "#111111",
    destelloPicos: 16,
    destelloGrosor: 6,
    bordeColor: "#c62828",
    bordeGrosor: 24,
    bordeRadio: 0,
    vinetaColor: "#000000",
    vinetaFuerza: 0.35,
    tramaColor: "#111111",
    tramaOpacidad: 0.22,
    tramaPaso: 22,
    tramaAlcance: 0.42,
    temblorFuerza: 1,
    zoomPaso: 0.035,
  },
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
  marcadores: "marcador",
  placeholder: "marcador",
  efecto: "efectos",
  fx: "efectos",
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
