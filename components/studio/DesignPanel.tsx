"use client";

import { useState } from "react";
import { DEFAULT_TEMPLATE, FONT_KEYS, FONT_LABELS, type Template } from "@/lib/dsl/template";

const GROUP_LABELS: Record<string, string> = {
  lienzo: "Lienzo",
  paleta: "Paleta",
  titulos: "Títulos A / B",
  imagenes: "Imágenes A / B",
  texto: "Rótulo central",
  muneco: "Muñeco",
  subtitulo: "Subtítulo",
  foco: "Foco",
  extra: "Textos extra",
  efectos: "Efectos",
};

const KEY_LABELS: Record<string, string> = {
  fondo: "Fondo",
  acento: "Acento",
  tinta: "Tinta",
  suave: "Suave",
  fuente: "Fuente",
  tam: "Tamaño",
  peso: "Peso",
  color: "Color",
  y: "Posición Y",
  x: "Posición X",
  xA: "X de A",
  xB: "X de B",
  xCentro: "X centrado",
  interlineado: "Interlineado",
  tracking: "Tracking",
  mayusculas: "Mayúsculas",
  anchoMax: "Ancho máx.",
  ancho: "Ancho",
  alto: "Alto",
  rotacion: "Rotación",
  escalaCentro: "Escala (centro)",
  trazo: "Trazo",
  corbata: "Corbata",
  camisa: "Relleno",
  grosor: "Grosor línea",
  opacidad: "Opacidad",
  radio: "Radio",
  yBase: "Base Y",
  padX: "Relleno X",
  padY: "Relleno Y",
  alineacion: "Alineación",
  lineasColor: "Líneas: color",
  lineasCantidad: "Líneas: cantidad",
  lineasHueco: "Líneas: hueco",
  lineasGrosor: "Líneas: grosor",
  velocidadColor: "Velocidad",
  destelloColor: "Impacto: relleno",
  destelloTrazo: "Impacto: trazo",
  bordeColor: "Borde: color",
  bordeGrosor: "Borde: grosor",
  bordeRadio: "Borde: radio",
  vinetaColor: "Viñeta: color",
  vinetaFuerza: "Viñeta: fuerza",
  tramaColor: "Trama",
  temblorFuerza: "Temblor",
  zoomPaso: "Zoom: paso",
};

function range(key: string): [number, number, number] {
  if (key === "lineasCantidad") return [10, 300, 1];
  if (key === "lineasHueco") return [0.2, 1.2, 0.01];
  if (key === "lineasGrosor" || key === "temblorFuerza") return [0.2, 4, 0.1];
  if (key === "vinetaFuerza") return [0, 1, 0.05];
  if (key === "zoomPaso") return [0, 0.2, 0.005];
  if (key === "bordeGrosor" || key === "bordeRadio") return [0, 120, 1];
  if (key === "peso") return [100, 900, 100];
  if (key === "tam") return [10, 220, 1];
  if (key === "interlineado") return [0.7, 2, 0.02];
  if (key === "tracking") return [-6, 12, 0.1];
  if (key === "opacidad") return [0, 1, 0.05];
  if (key === "rotacion") return [-45, 45, 1];
  if (key === "escalaCentro") return [0.5, 2.5, 0.05];
  if (key === "grosor") return [1, 16, 0.5];
  if (key === "radio" || key === "padX" || key === "padY") return [0, 90, 1];
  if (key.startsWith("x")) return [0, 1080, 1];
  if (key === "y" || key === "yBase") return [0, 1920, 1];
  if (key === "alto") return [40, 1800, 1];
  return [20, 1080, 1];
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** Diferencia contra la plantilla por defecto, como líneas @estilo */
export function templateAsDSL(t: Template): string {
  const out: string[] = [];
  for (const [g, vals] of Object.entries(t)) {
    for (const [k, v] of Object.entries(vals as Record<string, unknown>)) {
      const d = (DEFAULT_TEMPLATE as unknown as Record<string, Record<string, unknown>>)[g][k];
      if (d !== v) out.push(`@estilo ${g}.${k} ${typeof v === "boolean" ? (v ? "si" : "no") : v}`);
    }
  }
  return out.join("\n");
}

interface Props {
  template: Template;
  onChange: (t: Template) => void;
  placeholders: boolean;
  onPlaceholders: (v: boolean) => void;
  overrides: Record<string, string>;
}

export function DesignPanel({ template, onChange, placeholders, onPlaceholders, overrides }: Props) {
  const [open, setOpen] = useState<string>("titulos");
  const [copied, setCopied] = useState(false);

  const set = (g: string, k: string, v: unknown) => {
    const next = JSON.parse(JSON.stringify(template));
    next[g][k] = v;
    onChange(next);
  };

  const overridden = new Set(Object.keys(overrides).map((k) => k.toLowerCase()));

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-muted">
        La plantilla define el look base. Cada ajuste también se puede escribir en el guion con{" "}
        <code className="font-mono text-amber">@estilo grupo.clave valor</code>, que tiene prioridad sobre estos controles.
      </p>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[13px]">
        <span>Mostrar marcadores de imágenes faltantes</span>
        <Toggle on={placeholders} onClick={() => onPlaceholders(!placeholders)} />
      </label>

      {Object.entries(template).map(([g, vals]) => {
        const isOpen = open === g;
        return (
          <section key={g} className="overflow-hidden rounded-xl border border-line bg-panel-2">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? "" : g)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-panel-3"
              aria-expanded={isOpen}
            >
              <span>{GROUP_LABELS[g] ?? g}</span>
              <span className={`text-faint transition-transform duration-500 ${isOpen ? "rotate-45" : ""}`} style={{ transitionTimingFunction: "var(--ease-out)" }}>
                +
              </span>
            </button>
            {isOpen && (
              <div className="rise space-y-2.5 border-t border-line px-3 py-3">
                {Object.entries(vals as Record<string, unknown>).map(([k, v]) => {
                  const id = `${g}-${k}`;
                  const locked = overridden.has(`${g}.${k}`.toLowerCase());
                  const label = (
                    <label htmlFor={id} className="flex items-center gap-1.5 text-[12px] text-muted">
                      {KEY_LABELS[k] ?? k}
                      {locked && (
                        <span className="rounded bg-accent-soft px-1 text-[10px] text-accent" title="Sobrescrito por @estilo en el guion">
                          @estilo
                        </span>
                      )}
                    </label>
                  );
                  if (typeof v === "number") {
                    const [min, max, step] = range(k);
                    return (
                      <div key={k} className="grid grid-cols-[104px_1fr_56px] items-center gap-2">
                        {label}
                        <input id={id} type="range" className="rng" min={min} max={max} step={step} value={v} onChange={(e) => set(g, k, parseFloat(e.target.value))} />
                        <input
                          type="number"
                          aria-label={`${k} valor`}
                          value={fmt(v)}
                          step={step}
                          onChange={(e) => set(g, k, parseFloat(e.target.value) || 0)}
                          className="w-full rounded-md border border-line bg-ink px-1.5 py-1 text-right font-mono text-[11px] tabular-nums outline-none focus:border-accent"
                        />
                      </div>
                    );
                  }
                  if (typeof v === "boolean") {
                    return (
                      <div key={k} className="flex items-center justify-between">
                        {label}
                        <Toggle on={v} onClick={() => set(g, k, !v)} />
                      </div>
                    );
                  }
                  if (k === "fuente") {
                    return (
                      <div key={k} className="grid grid-cols-[104px_1fr] items-center gap-2">
                        {label}
                        <select
                          id={id}
                          value={String(v)}
                          onChange={(e) => set(g, k, e.target.value)}
                          className="rounded-md border border-line bg-ink px-2 py-1.5 text-[12px] outline-none focus:border-accent"
                        >
                          {FONT_KEYS.map((f) => (
                            <option key={f} value={f}>
                              {FONT_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  if (k === "alineacion") {
                    return (
                      <div key={k} className="grid grid-cols-[104px_1fr] items-center gap-2">
                        {label}
                        <div className="flex gap-1">
                          {["izq", "centro"].map((a) => (
                            <button
                              key={a}
                              type="button"
                              onClick={() => set(g, k, a)}
                              className={`flex-1 rounded-md border px-2 py-1 text-[12px] transition-colors ${v === a ? "border-accent bg-accent-soft text-text" : "border-line text-muted hover:text-text"}`}
                            >
                              {a === "izq" ? "Izquierda" : "Centro"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={k} className="grid grid-cols-[104px_26px_1fr] items-center gap-2">
                      {label}
                      <input
                        id={id}
                        type="color"
                        className="swatch"
                        value={/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : "#111111"}
                        onChange={(e) => set(g, k, e.target.value)}
                      />
                      <input
                        aria-label={`${k} texto`}
                        value={String(v)}
                        onChange={(e) => set(g, k, e.target.value)}
                        className="rounded-md border border-line bg-ink px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
                      />
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    const next = JSON.parse(JSON.stringify(template));
                    next[g] = JSON.parse(JSON.stringify((DEFAULT_TEMPLATE as unknown as Record<string, unknown>)[g]));
                    onChange(next);
                  }}
                  className="text-[12px] text-faint underline-offset-4 transition-colors hover:text-accent hover:underline"
                >
                  Restablecer {GROUP_LABELS[g]?.toLowerCase()}
                </button>
              </div>
            )}
          </section>
        );
      })}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(templateAsDSL(template) || "# La plantilla es la de fábrica");
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-[12px] transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? "Copiado ✓" : "Copiar cambios como @estilo"}
        </button>
        <button
          type="button"
          onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)))}
          className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted transition-colors hover:text-text"
        >
          Todo de fábrica
        </button>
      </div>
    </div>
  );
}

export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${on ? "bg-accent" : "bg-panel-3"}`}
    >
      <span
        className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-text transition-transform duration-500"
        style={{ transform: on ? "translateX(16px)" : "none", transitionTimingFunction: "var(--ease-out)" }}
      />
    </button>
  );
}
