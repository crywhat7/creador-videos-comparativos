import { resolveMascot, slotTitle } from "../render/renderer";
import type { Frame, ParsedScript, SlotRef } from "../dsl/types";

export const pad3 = (n: number) => String(n).padStart(3, "0");

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "escena"
  );
}

export const frameFileName = (f: Frame) => `${pad3(f.index + 1)}_${slug(f.scene)}.png`;

export function fmtTime(t: number, srt = false): string {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  if (srt) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${Math.floor(r / 100)}`;
}

function slotJSON(ref: SlotRef | null, script: ParsedScript) {
  if (!ref) return null;
  const s = ref.subjectId ? script.subjects[ref.subjectId] : undefined;
  return {
    id: ref.subjectId ?? null,
    titulo: slotTitle(ref, script).replace(/\n/g, " "),
    descripcion_imagen: s?.prompt ?? null,
  };
}

/** Guion de narración pensado para que otra IA (voz / LLM) lo lea sin ambigüedad. */
export function toNarrationMarkdown(script: ParsedScript): string {
  const m = script.meta;
  const out: string[] = [];
  out.push(`# Guion de narración — ${m.titulo}`, "");
  out.push(`- **Idioma:** ${m.idioma}`);
  if (m.voz) out.push(`- **Voz / tono:** ${m.voz}`);
  out.push(`- **Líneas:** ${script.frames.length} · **Duración estimada:** ${fmtTime(script.totalDuration)} (ritmo ${m.ritmo} palabras/seg)`);
  for (const [k, v] of Object.entries(m.otros)) out.push(`- **${k}:** ${v}`);
  out.push("");
  out.push("## Instrucciones para la IA de voz", "");
  out.push("1. Narra el texto **en el orden exacto** de las líneas. Cada línea corresponde a una imagen del video.");
  out.push("2. Lo que está entre corchetes `[ ]` es dirección de interpretación (emoción, pausas, énfasis). **No lo leas en voz alta**; aplícalo.");
  out.push("3. `[pausa 0.5]` = silencio de medio segundo. Entre líneas deja una micro‑pausa natural, salvo que la línea continúe la frase anterior (sin puntuación final).");
  out.push("4. No agregues, resumas ni traduzcas contenido. Respeta la puntuación como guía de entonación.");
  out.push("");
  out.push("## Texto continuo (para pegar directo en el generador de voz)", "");
  out.push("```text");
  out.push(script.frames.map((f) => f.narration).filter(Boolean).join(" "));
  out.push("```", "");
  out.push("## Líneas sincronizadas con imágenes", "");
  let scene = -1;
  for (const f of script.frames) {
    if (f.sceneIndex !== scene) {
      scene = f.sceneIndex;
      out.push(`### Escena ${scene + 1}: ${f.scene}`, "");
    }
    out.push(`**${pad3(f.index + 1)}** · \`${fmtTime(f.start)} → ${fmtTime(f.start + f.duration)}\` · imagen \`${frameFileName(f)}\``);
    out.push(`> ${f.narration || "(sin narración)"}`);
    if (f.note) out.push(`> _Nota de dirección: ${f.note}_`);
    out.push("");
  }
  return out.join("\n");
}

export function toPlainText(script: ParsedScript): string {
  return script.frames.map((f) => f.narration).filter(Boolean).join("\n");
}

export function toSRT(script: ParsedScript): string {
  return script.frames
    .filter((f) => f.clean)
    .map((f, i) => `${i + 1}\n${fmtTime(f.start, true)} --> ${fmtTime(f.start + f.duration, true)}\n${f.subtitle ?? f.clean}\n`)
    .join("\n");
}

export function toTimeline(script: ParsedScript) {
  return {
    formato: "versus-guion/1",
    proyecto: {
      titulo: script.meta.titulo,
      idioma: script.meta.idioma,
      voz: script.meta.voz,
      ritmo_palabras_seg: script.meta.ritmo,
      resolucion: `${script.meta.ancho}x${script.meta.alto}`,
      ...script.meta.otros,
    },
    instrucciones_voz:
      "Narra 'narracion' de cada fotograma en orden. Lo que va entre [corchetes] son direcciones de interpretación y no se leen. 'texto_limpio' es lo que efectivamente se dice.",
    duracion_total_seg: script.totalDuration,
    escenas: script.scenes.map((s) => ({ n: s.index + 1, titulo: s.title, primer_fotograma: s.firstFrame + 1, fotogramas: s.frameCount })),
    sujetos: Object.values(script.subjects).map((s) => ({ id: s.id, titulo: s.title.replace(/\n/g, " "), descripcion_imagen: s.prompt ?? null, archivo: s.file ?? null })),
    fotogramas: script.frames.map((f) => ({
      n: f.index + 1,
      imagen: frameFileName(f),
      escena: f.scene,
      inicio_seg: f.start,
      duracion_seg: f.duration,
      duracion_fija: f.explicitDuration,
      narracion: f.narration,
      texto_limpio: f.clean,
      subtitulo: f.subtitle,
      nota_direccion: f.note,
      visual: {
        A: slotJSON(f.state.A, script),
        B: f.state.layout === "centro" ? null : slotJSON(f.state.B, script),
        layout: f.state.layout,
        foco: f.state.focus,
        muneco: f.state.mascot ? { ...resolveMascot(f.state.mascot, script), def: undefined, valor: f.state.mascot } : null,
        texto: f.state.caption,
        extras: Object.values(f.state.extras).map((e) => ({ id: e.id, texto: e.text })),
      },
    })),
  };
}

/** Lista de recursos visuales a producir / generar con IA de imagen. */
export function toImageList(script: ParsedScript, assets: Record<string, string>): string {
  const used = new Map<string, number>();
  const poses = new Map<string, number>();
  for (const f of script.frames) {
    for (const r of [f.state.A, f.state.B]) if (r?.subjectId) used.set(r.subjectId, (used.get(r.subjectId) ?? 0) + 1);
    if (f.state.mascot) poses.set(f.state.mascot, (poses.get(f.state.mascot) ?? 0) + 1);
  }
  const out: string[] = [`# Recursos visuales — ${script.meta.titulo}`, ""];
  out.push("Imágenes de sujetos con **fondo blanco o transparente**, objeto completo, sin texto. Formato recomendado PNG.", "");
  out.push("## Sujetos (imagen A / B)", "");
  for (const s of Object.values(script.subjects)) {
    const done = !!(assets[`sujeto:${s.id}`] || (s.file && assets[s.file]) || (s.file && /^https?:/.test(s.file)));
    out.push(`- [${done ? "x" : " "}] **${s.title.replace(/\n/g, " ")}** (\`${s.id}\`) — usado en ${used.get(s.id) ?? 0} fotogramas`);
    out.push(`  - Prompt: ${s.prompt ?? "_(falta descripción: agrega `imagen:` al sujeto)_"}`);
    if (s.file) out.push(`  - Archivo esperado: \`${s.file}\``);
  }
  out.push("", "## Poses del muñeco usadas", "");
  for (const [p, n] of poses) {
    const r = resolveMascot(p, script);
    out.push(`- \`${p}\` → base **${r.base}**, cara **${r.face}** — ${n} fotogramas${r.def?.prompt ? ` — ${r.def.prompt}` : ""}`);
  }
  return out.join("\n");
}
