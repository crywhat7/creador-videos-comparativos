import type {
  Diagnostic,
  ExtraText,
  Focus,
  Frame,
  Meta,
  ParsedScript,
  PoseDef,
  Scene,
  SlotRef,
  Subject,
  VisualState,
} from "./types";

export const BUILTIN_POSES = [
  "neutral",
  "apunta-izq",
  "apunta-der",
  "duda",
  "presenta",
  "pulgar",
] as const;

export const FACES = ["feliz", "picaro", "duda", "sorpresa", "serio", "triste"] as const;

/** minúsculas + sin tildes: "Muñeco" → "muneco", "pícaro" → "picaro" */
export function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1).replace(/\\n/g, "\n");
  }
  return t.replace(/\\n/g, "\n");
}

const PROP_ALIASES: Record<string, string> = {
  a: "A",
  b: "B",
  muneco: "mascot",
  personaje: "mascot",
  mascota: "mascot",
  texto: "caption",
  frase: "caption",
  rotulo: "caption",
  foco: "focus",
  sub: "subs",
  subs: "subs",
  subtitulos: "subs",
  fondo: "background",
  layout: "layout",
  disposicion: "layout",
  nota: "note",
};

const META_ALIASES: Record<string, keyof Meta | "estilo"> = {
  titulo: "titulo",
  proyecto: "titulo",
  idioma: "idioma",
  lang: "idioma",
  voz: "voz",
  ritmo: "ritmo",
  formato: "ancho",
  estilo: "estilo",
};

function emptyState(): VisualState {
  return {
    A: null,
    B: null,
    mascot: null,
    caption: null,
    focus: "ambos",
    subs: true,
    extras: {},
    background: null,
    layout: "duo",
    style: {},
  };
}

function cloneState(s: VisualState): VisualState {
  return {
    ...s,
    A: s.A ? { ...s.A } : null,
    B: s.B ? { ...s.B } : null,
    extras: Object.fromEntries(Object.entries(s.extras).map(([k, v]) => [k, { ...v }])),
    style: { ...s.style },
  };
}

const isOff = (v: string) => ["-", "no", "off", "ninguno", "nada", "oculto", "false"].includes(norm(v));
const isOn = (v: string) => ["si", "sí", "on", "visible", "true", "yes"].includes(norm(v));

/** "(x:75, y:40, tam:56)" → { x: "75", ... } */
export function parseOptions(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of src.split(",")) {
    const i = part.indexOf(":");
    if (i < 0) {
      const k = norm(part);
      if (k) out[k] = "si";
      continue;
    }
    out[norm(part.slice(0, i))] = part.slice(i + 1).trim();
  }
  return out;
}

const TAG_RE = /\[[^\]]*\]/g;
const PAUSE_RE = /\[(?:pausa|pause)\s*([\d.,]+)?\s*s?\]/gi;

export function cleanNarration(s: string): string {
  return s.replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
}

function pauseSeconds(s: string): number {
  let total = 0;
  for (const m of s.matchAll(PAUSE_RE)) total += m[1] ? parseFloat(m[1].replace(",", ".")) : 0.5;
  return total;
}

export function estimateDuration(narration: string, wps: number): number {
  const words = cleanNarration(narration).split(/\s+/).filter(Boolean).length;
  const secs = words / Math.max(0.5, wps) + pauseSeconds(narration) + 0.25;
  return Math.max(1, Math.round(secs * 10) / 10);
}

export function parseScript(src: string): ParsedScript {
  const lines = src.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const meta: Meta = { titulo: "Sin título", idioma: "es", voz: "", ritmo: 2.6, ancho: 1080, alto: 1920, otros: {} };
  const subjects: Record<string, Subject> = {};
  const poses: Record<string, PoseDef> = {};
  const scenes: Scene[] = [];
  const frames: Frame[] = [];
  const globalStyle: Record<string, string> = {};
  const refs: { id: string; line: number; kind: "sujeto" | "pose" }[] = [];

  let state = emptyState();
  let block: { kind: "sujeto"; s: Subject } | { kind: "pose"; p: PoseDef } | null = null;
  let pendingNote: string | null = null;
  let currentScene: Scene | null = null;

  const warn = (line: number, msg: string) => diagnostics.push({ line, level: "warn", msg });
  const error = (line: number, msg: string) => diagnostics.push({ line, level: "error", msg });

  const ensureScene = (line: number) => {
    if (!currentScene) {
      currentScene = { index: scenes.length, title: "Sin escena", line, firstFrame: frames.length, frameCount: 0 };
      scenes.push(currentScene);
    }
    return currentScene;
  };

  const parseSlot = (v: string, line: number): SlotRef | null => {
    if (isOff(v)) return null;
    const t = v.trim();
    if (t.startsWith('"') || t.startsWith("'")) return { title: unquote(t) };
    const m = t.match(/^([^\s"']+)\s*(.*)$/);
    if (!m) return null;
    const id = norm(m[1]);
    refs.push({ id, line, kind: "sujeto" });
    return m[2] ? { subjectId: id, title: unquote(m[2]) } : { subjectId: id };
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    // ── Propiedades indentadas de un bloque sujeto / pose
    const indented = /^[ \t]/.test(raw);
    if (indented && block && !trimmed.startsWith(">") && !trimmed.startsWith("==")) {
      const c = trimmed.indexOf(":");
      if (c < 0) {
        warn(ln, `Se esperaba "clave: valor" dentro de ${block.kind}`);
        continue;
      }
      const key = norm(trimmed.slice(0, c));
      const val = trimmed.slice(c + 1).trim();
      if (block.kind === "sujeto") {
        const s = block.s;
        if (["imagen", "prompt", "descripcion"].includes(key)) s.prompt = unquote(val);
        else if (["archivo", "file", "url", "src"].includes(key)) s.file = unquote(val);
        else if (key === "titulo") s.title = unquote(val);
        else if (key === "nota") s.note = unquote(val);
        else if (key === "escala") s.scale = parseFloat(val);
        else if (["rotacion", "rot"].includes(key)) s.rotation = parseFloat(val);
        else if (key === "x" || key === "dx") s.dx = parseFloat(val);
        else if (key === "y" || key === "dy") s.dy = parseFloat(val);
        else if (key === "color") s.titleColor = val;
        else warn(ln, `Propiedad de sujeto desconocida: "${key}"`);
      } else {
        const p = block.p;
        if (key === "base") p.base = norm(val);
        else if (key === "cara") p.face = norm(val);
        else if (["archivo", "file", "url", "src"].includes(key)) p.file = unquote(val);
        else if (["imagen", "prompt", "descripcion"].includes(key)) p.prompt = unquote(val);
        else if (key === "espejo") p.mirror = isOn(val);
        else warn(ln, `Propiedad de pose desconocida: "${key}"`);
      }
      continue;
    }
    block = null;

    // ── Cabecera @clave valor
    if (trimmed.startsWith("@")) {
      const m = trimmed.match(/^@([\wñáéíóú.-]+)\s*(.*)$/i);
      if (!m) continue;
      const key = norm(m[1]);
      const val = m[2].trim();
      const target = META_ALIASES[key];
      if (target === "estilo") {
        const sm = val.match(/^([\w.ñ-]+)\s*[:=]?\s*(.+)$/i);
        if (!sm) warn(ln, "Uso: @estilo clave.sub valor   (ej: @estilo titulos.tam 80)");
        else globalStyle[norm(sm[1])] = unquote(sm[2]);
      } else if (target === "ancho") {
        const fm = val.match(/^(\d+)\s*[x×]\s*(\d+)$/);
        if (fm) {
          meta.ancho = +fm[1];
          meta.alto = +fm[2];
        } else warn(ln, "Formato inválido, usa por ejemplo 1080x1920");
      } else if (target === "ritmo") {
        const r = parseFloat(val.replace(",", "."));
        if (isFinite(r) && r > 0) meta.ritmo = r;
        else warn(ln, "El ritmo debe ser palabras por segundo (ej: 2.6)");
      } else if (target) {
        (meta as unknown as Record<string, string>)[target] = unquote(val);
      } else {
        meta.otros[key] = unquote(val);
      }
      continue;
    }

    // ── Definición de sujeto
    let m = trimmed.match(/^sujeto\s+([^\s:"']+)\s*:?\s*(.*)$/i);
    if (m) {
      const id = norm(m[1]);
      if (subjects[id]) warn(ln, `El sujeto "${id}" ya estaba definido (línea ${subjects[id].line})`);
      const s: Subject = { id, title: m[2] ? unquote(m[2]) : m[1], line: ln };
      subjects[id] = s;
      block = { kind: "sujeto", s };
      continue;
    }

    // ── Definición de pose
    m = trimmed.match(/^pose\s+([^\s:"']+)\s*:?\s*(.*)$/i);
    if (m) {
      const id = norm(m[1]);
      const parts = norm(unquote(m[2] || "")).split(/\s+/).filter(Boolean);
      const p: PoseDef = { id, base: parts[0] ?? "neutral", face: parts[1], line: ln };
      poses[id] = p;
      block = { kind: "pose", p };
      continue;
    }

    // ── Escena
    if (trimmed.startsWith("==")) {
      const title = trimmed.replace(/^=+/, "").replace(/=+$/, "").trim() || `Escena ${scenes.length + 1}`;
      currentScene = { index: scenes.length, title, line: ln, firstFrame: frames.length, frameCount: 0 };
      scenes.push(currentScene);
      continue;
    }

    // ── Fotograma
    if (trimmed.startsWith(">")) {
      const sc = ensureScene(ln);
      let body = trimmed.slice(1).trim();
      const opts: Record<string, string> = {};
      const om = body.match(/\{([^}]*)\}\s*$/);
      if (om) {
        for (const tok of om[1].split(/[,\s]+/).filter(Boolean)) {
          const [k, v] = tok.split(/[:=]/);
          opts[norm(k)] = v ?? "si";
        }
        body = body.slice(0, om.index).trim();
      }
      let subOverride: string | undefined;
      const pipe = body.indexOf("|");
      if (pipe >= 0) {
        subOverride = body.slice(pipe + 1).trim();
        body = body.slice(0, pipe).trim();
      }
      let explicit: number | undefined;
      let hideSub = false;
      let forceSub = false;
      for (const [k, v] of Object.entries(opts)) {
        const dm = k.match(/^([\d.]+)s$/);
        if (dm) explicit = parseFloat(dm[1]);
        else if (k === "duracion" || k === "dur") explicit = parseFloat(v);
        else if (["sin-sub", "nosub", "sinsub", "sin-subtitulo"].includes(k)) hideSub = true;
        else if (k === "sub" && v === "si") forceSub = true;
        else warn(ln, `Opción de fotograma desconocida: "${k}"`);
      }
      const clean = cleanNarration(body);
      if (!clean && !body) warn(ln, "Fotograma sin narración (se mostrará sin voz)");
      const showSub = forceSub || (state.subs && !hideSub);
      const subtitle = showSub ? (subOverride !== undefined ? subOverride : clean) || null : null;
      const duration = explicit ?? (clean ? estimateDuration(body, meta.ritmo) : 1.5);
      frames.push({
        index: frames.length,
        line: ln,
        scene: sc.title,
        sceneIndex: sc.index,
        narration: body,
        clean,
        subtitle,
        duration,
        start: 0,
        explicitDuration: explicit !== undefined,
        note: pendingNote,
        state: cloneState(state),
      });
      sc.frameCount++;
      pendingNote = null;
      continue;
    }

    // ── Comando limpiar
    if (["limpiar", "reset", "limpiar todo"].includes(norm(trimmed))) {
      state = emptyState();
      continue;
    }

    // ── extra id: "texto" (opciones)
    m = trimmed.match(/^extra\s+([^\s:]+)\s*:\s*(.*)$/i);
    if (m) {
      const id = norm(m[1]);
      const val = m[2].trim();
      if (isOff(val)) {
        delete state.extras[id];
        continue;
      }
      const em = val.match(/^("[^"]*"|'[^']*'|[^(]+?)\s*(?:\((.*)\))?\s*$/);
      if (!em) {
        warn(ln, 'Uso: extra id: "texto" (x:50, y:20, tam:60, color:acento)');
        continue;
      }
      const o = parseOptions(em[2] ?? "");
      const prev = state.extras[id];
      const e: ExtraText = {
        id,
        text: unquote(em[1]),
        x: o.x ? parseFloat(o.x) : prev?.x ?? 50,
        y: o.y ? parseFloat(o.y) : prev?.y ?? 10,
        size: o.tam ? parseFloat(o.tam) : prev?.size,
        color: o.color ?? prev?.color,
        weight: o.peso ? parseFloat(o.peso) : prev?.weight,
        font: o.fuente ? norm(o.fuente) : prev?.font,
        align: (o.alinear as ExtraText["align"]) ?? prev?.align,
        rotation: o.rot ? parseFloat(o.rot) : o.rotacion ? parseFloat(o.rotacion) : prev?.rotation,
        bg: o.fondo ?? prev?.bg,
      };
      state.extras[id] = e;
      continue;
    }

    // ── estilo clave: valor (persistente desde aquí)
    m = trimmed.match(/^estilo\s+([\w.ñ-]+)\s*[:=]\s*(.*)$/i);
    if (m) {
      const key = norm(m[1]);
      if (isOff(m[2])) delete state.style[key];
      else state.style[key] = unquote(m[2]);
      continue;
    }

    // ── propiedad: valor
    const c = trimmed.indexOf(":");
    if (c > 0) {
      const key = PROP_ALIASES[norm(trimmed.slice(0, c))];
      const val = trimmed.slice(c + 1).trim();
      if (!key) {
        error(ln, `Propiedad desconocida: "${trimmed.slice(0, c)}"`);
        continue;
      }
      switch (key) {
        case "A":
        case "B":
          state[key] = parseSlot(val, ln);
          break;
        case "mascot":
          if (isOff(val)) state.mascot = null;
          else {
            const v = norm(unquote(val));
            const first = v.split(/\s+/)[0];
            if (!(BUILTIN_POSES as readonly string[]).includes(first)) refs.push({ id: first, line: ln, kind: "pose" });
            const face = v.split(/\s+/)[1];
            if (face && !(FACES as readonly string[]).includes(face)) warn(ln, `Cara desconocida "${face}". Usa: ${FACES.join(", ")}`);
            state.mascot = v;
          }
          break;
        case "caption":
          state.caption = isOff(val) ? null : unquote(val);
          break;
        case "focus": {
          const f = norm(val);
          const map: Record<string, Focus> = { a: "A", b: "B", ambos: "ambos", todos: "ambos", ninguno: "ninguno", "-": "ninguno" };
          if (map[f]) state.focus = map[f];
          else warn(ln, "foco: A | B | ambos | ninguno");
          break;
        }
        case "subs":
          state.subs = !isOff(val);
          break;
        case "background":
          state.background = isOff(val) ? null : val;
          break;
        case "layout": {
          const l = norm(val);
          if (l === "duo" || l === "centro") state.layout = l;
          else warn(ln, "layout: duo | centro");
          break;
        }
        case "note":
          pendingNote = unquote(val);
          break;
      }
      continue;
    }

    error(ln, `No entiendo esta línea. ¿Te faltó ">" para narración o ":" para una propiedad?`);
  }

  // Validar referencias
  for (const r of refs) {
    if (r.kind === "sujeto" && !subjects[r.id]) warn(r.line, `Sujeto "${r.id}" no definido; se usará el id como título`);
    if (r.kind === "pose" && !poses[r.id]) warn(r.line, `Pose "${r.id}" no existe. Base: ${BUILTIN_POSES.join(", ")}`);
  }
  for (const p of Object.values(poses)) {
    if (!(BUILTIN_POSES as readonly string[]).includes(p.base) && !p.file)
      warn(p.line, `Base de pose "${p.base}" desconocida (usa ${BUILTIN_POSES.join(", ")} o un archivo)`);
  }
  if (frames.length === 0) diagnostics.push({ line: 1, level: "info", msg: 'Aún no hay fotogramas. Escribe una línea que empiece con ">"' });

  let t = 0;
  for (const f of frames) {
    f.start = Math.round(t * 10) / 10;
    t += f.duration;
  }

  return { meta, subjects, poses, scenes, frames, globalStyle, diagnostics, totalDuration: Math.round(t * 10) / 10 };
}

/** Índice del fotograma que corresponde a una línea del editor */
export function frameAtLine(frames: Frame[], line: number): number {
  let found = -1;
  for (const f of frames) {
    if (f.line <= line) found = f.index;
    else break;
  }
  if (found === -1 && frames.length) return 0;
  return found;
}
