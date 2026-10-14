import type {
  Beat,
  Diagnostic,
  Effect,
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
  "apunta-centro",
  "duda",
  "presenta",
  "pulgar",
] as const;

export const FACES = ["feliz", "picaro", "duda", "sorpresa", "serio", "triste"] as const;

export const EFFECTS: { id: string; label: string; desc: string; aliases: string[]; example: string }[] = [
  { id: "lineas-anime", label: "Líneas anime", desc: "Líneas de concentración manga desde los bordes hacia el centro.", aliases: ["lineas", "manga", "anime", "concentracion"], example: "efecto: lineas-anime" },
  { id: "velocidad", label: "Velocidad", desc: "Rayas horizontales de movimiento en los costados.", aliases: ["speed"], example: "efecto: velocidad" },
  { id: "destello", label: "Impacto", desc: "Estallido de cómic detrás del rótulo central.", aliases: ["impacto", "explosion", "boom"], example: "efecto: destello(color:#ffd23f)" },
  { id: "borde", label: "Borde", desc: "Marco de color alrededor de la pantalla.", aliases: ["marco"], example: "efecto: borde(color:acento, grosor:28)" },
  { id: "vineta", label: "Viñeta", desc: "Oscurece o tiñe los bordes de la pantalla.", aliases: [], example: "efecto: vineta(color:#000, fuerza:0.35)" },
  { id: "trama", label: "Trama manga", desc: "Puntos de semitono en las esquinas.", aliases: ["puntos", "halftone"], example: "efecto: trama" },
  { id: "temblor", label: "Temblor", desc: "Sacude ligeramente la composición en cada imagen.", aliases: ["shake", "sacudida"], example: "efecto: temblor(fuerza:1.5)" },
  { id: "zoom", label: "Zoom progresivo", desc: "Acerca un poco más la imagen en cada trozo del rótulo.", aliases: ["acercar", "punch"], example: "efecto: zoom(paso:0.04)" },
];

const EFFECT_ALIAS: Record<string, string> = Object.fromEntries(
  EFFECTS.flatMap((e) => [[e.id, e.id], ...e.aliases.map((a) => [a, e.id] as const)]),
);

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
  c: "C",
  muneco: "mascot",
  personaje: "mascot",
  mascota: "mascot",
  texto: "caption",
  frase: "caption",
  rotulo: "caption",
  palabras: "words",
  foco: "focus",
  sub: "subs",
  subs: "subs",
  subtitulos: "subs",
  fondo: "background",
  layout: "layout",
  disposicion: "layout",
  nota: "note",
  efecto: "effects",
  efectos: "effects",
  fx: "effects",
};

const META_ALIASES: Record<string, keyof Meta | "estilo"> = {
  titulo: "titulo",
  proyecto: "titulo",
  idioma: "idioma",
  lang: "idioma",
  voz: "voz",
  ritmo: "ritmo",
  palabras: "palabras",
  formato: "ancho",
  estilo: "estilo",
};

function emptyState(): VisualState {
  return {
    A: null,
    B: null,
    C: null,
    mascot: null,
    captionMode: "auto",
    caption: null,
    words: 0,
    focus: "ambos",
    subs: true,
    extras: {},
    effects: [],
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
    C: s.C ? { ...s.C } : null,
    extras: Object.fromEntries(Object.entries(s.extras).map(([k, v]) => [k, { ...v }])),
    effects: s.effects.map((e) => ({ name: e.name, opts: { ...e.opts } })),
    style: { ...s.style },
  };
}

const isOff = (v: string) => ["-", "no", "off", "ninguno", "nada", "oculto", "false"].includes(norm(v));
const isOn = (v: string) => ["si", "sí", "on", "visible", "true", "yes"].includes(norm(v));

/** "x:75, y:40, tam:56" → { x: "75", ... } */
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

/** "lineas-anime, borde(color:acento, grosor:20)" → [{name, opts}] */
export function parseEffects(src: string, onUnknown?: (name: string) => void): Effect[] {
  const out: Effect[] = [];
  let depth = 0;
  let cur = "";
  const flush = () => {
    const t = cur.trim();
    cur = "";
    if (!t) return;
    const m = t.match(/^([^\s(]+)\s*(?:\((.*)\))?$/);
    if (!m) return onUnknown?.(t);
    const id = EFFECT_ALIAS[norm(m[1])];
    if (!id) return onUnknown?.(m[1]);
    out.push({ name: id, opts: parseOptions(m[2] ?? "") });
  };
  for (const ch of src) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "," || ch === "+") && depth === 0) flush();
    else cur += ch;
  }
  flush();
  return out;
}

const TAG_RE = /\[[^\]]*\]/g;
const PAUSE_RE = /\[(?:pausa|pause)\s*([\d.,]+)?\s*s?\]/gi;
const CUT_RE = /\s+\/\s+/g;

export function cleanNarration(s: string): string {
  return s.replace(TAG_RE, " ").replace(CUT_RE, " ").replace(/\s+/g, " ").trim();
}

function pauseSeconds(s: string): number {
  let total = 0;
  for (const m of s.matchAll(PAUSE_RE)) total += m[1] ? parseFloat(m[1].replace(",", ".")) : 0.5;
  return total;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function estimateDuration(narration: string, wps: number): number {
  const secs = wordCount(cleanNarration(narration)) / Math.max(0.5, wps) + pauseSeconds(narration) + 0.25;
  return Math.max(1, Math.round(secs * 10) / 10);
}

/** Palabras que no deberían quedar solas al final de un trozo (se pasan al siguiente). */
const GLUE = new Set(
  "a an the of to in on at for and or but its my your his her our their with from by as el la los las un una unos unas de del al y e o u que en con por para su sus mi mis tu tus se lo le es muy mas sin sobre entre".split(" "),
);

/** Divide la narración en trozos cortos para el rótulo tipo karaoke. */
export function chunkText(clean: string, maxWords: number): string[] {
  const words = clean.split(/\s+/).filter(Boolean);
  const max = Math.max(1, Math.round(maxWords));
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const punct = /[,.;:!?…)"»]$/.test(w);
    const last = i === words.length - 1;
    if (last) break;
    if (punct || cur.length >= max) {
      let carry: string | undefined;
      if (!punct && cur.length > 1 && GLUE.has(norm(cur[cur.length - 1]).replace(/[^\p{L}]/gu, ""))) carry = cur.pop();
      chunks.push(cur);
      cur = carry ? [carry] : [];
    }
  }
  if (cur.length) chunks.push(cur);
  // Una palabra suelta al final se une al trozo anterior si no queda muy largo
  if (chunks.length > 1 && chunks.at(-1)!.length === 1 && chunks.at(-2)!.length < max + 1 && !/[.!?…]$/.test(chunks.at(-2)!.at(-1)!)) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1].push(...tail);
  }
  return chunks.map((c) => c.join(" "));
}

export function parseScript(src: string): ParsedScript {
  const lines = src.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const meta: Meta = { titulo: "Sin título", idioma: "es", voz: "", ritmo: 2.6, palabras: 3, ancho: 1080, alto: 1920, otros: {} };
  const subjects: Record<string, Subject> = {};
  const poses: Record<string, PoseDef> = {};
  const scenes: Scene[] = [];
  const beats: Beat[] = [];
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
      } else if (target === "ritmo" || target === "palabras") {
        const r = parseFloat(val.replace(",", "."));
        if (isFinite(r) && r > 0) meta[target] = r;
        else warn(ln, target === "ritmo" ? "El ritmo debe ser palabras por segundo (ej: 2.6)" : "@palabras necesita un número (ej: 3)");
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

    // ── Línea de narración → una o más imágenes
    if (trimmed.startsWith(">")) {
      const sc = ensureScene(ln);
      let body = trimmed.slice(1).trim();
      const opts: Record<string, string> = {};
      const om = body.match(/\{([^}]*)\}\s*$/);
      if (om) {
        for (const tok of om[1].split(/[,\s]+/).filter(Boolean)) {
          const ci = tok.search(/[:=]/);
          if (ci < 0) opts[norm(tok)] = "si";
          else opts[norm(tok.slice(0, ci))] = tok.slice(ci + 1);
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
      let whole = false;
      let words = state.words || meta.palabras;
      const frameState = cloneState(state);
      for (const [k, v] of Object.entries(opts)) {
        const dm = k.match(/^([\d.]+)s$/);
        if (dm) explicit = parseFloat(dm[1]);
        else if (k === "duracion" || k === "dur") explicit = parseFloat(v);
        else if (["sin-sub", "nosub", "sinsub", "sin-subtitulo"].includes(k)) hideSub = true;
        else if (k === "sub" && v === "si") forceSub = true;
        else if (["entero", "completo", "sin-cortes"].includes(k)) whole = true;
        else if (k === "palabras") words = parseFloat(v) || words;
        else if (["efecto", "efectos", "fx"].includes(k)) {
          frameState.effects.push(...parseEffects(v, (n) => warn(ln, `Efecto desconocido: "${n}"`)));
        } else warn(ln, `Opción de línea desconocida: "${k}"`);
      }
      const manualParts = body.split(CUT_RE).map(cleanNarration).filter(Boolean);
      const narration = body.replace(CUT_RE, " ");
      const clean = cleanNarration(body);
      if (!clean) warn(ln, "Línea sin narración (se mostrará sin voz)");
      const showSub = forceSub || (state.subs && !hideSub);
      const subtitle = showSub ? (subOverride !== undefined ? subOverride : clean) || null : null;
      const duration = explicit ?? (clean ? estimateDuration(body, meta.ritmo) : 1.5);

      // Trozos del rótulo central
      let chunks: (string | null)[];
      if (state.captionMode === "off") chunks = [null];
      else if (state.captionMode === "fijo") chunks = [state.caption];
      else if (!clean) chunks = [null];
      else if (whole) chunks = [clean];
      else if (manualParts.length > 1) chunks = manualParts;
      else chunks = chunkText(clean, words);

      const totalW = chunks.reduce((n, c) => n + Math.max(1, c ? wordCount(c) : 1), 0);
      const beat: Beat = {
        index: beats.length,
        line: ln,
        scene: sc.title,
        sceneIndex: sc.index,
        narration,
        clean,
        subtitle,
        duration,
        start: 0,
        explicitDuration: explicit !== undefined,
        note: pendingNote,
        firstFrame: frames.length,
        frameCount: chunks.length,
      };
      beats.push(beat);
      chunks.forEach((chunk, ci) => {
        frames.push({
          index: frames.length,
          line: ln,
          scene: sc.title,
          sceneIndex: sc.index,
          beat: beat.index,
          chunkIndex: ci,
          chunkCount: chunks.length,
          caption: chunk,
          narration,
          clean,
          subtitle,
          duration: Math.round(((duration * Math.max(1, chunk ? wordCount(chunk) : 1)) / totalW) * 100) / 100,
          start: 0,
          explicitDuration: explicit !== undefined,
          note: pendingNote,
          state: frameState,
        });
      });
      sc.frameCount += chunks.length;
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
        case "C":
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
          if (isOff(val)) state.captionMode = "off";
          else if (["auto", "karaoke"].includes(norm(val))) state.captionMode = "auto";
          else {
            state.captionMode = "fijo";
            state.caption = unquote(val);
          }
          break;
        case "words": {
          const n = parseFloat(val);
          if (isFinite(n) && n > 0) state.words = n;
          else warn(ln, "palabras: necesita un número (ej: 3)");
          break;
        }
        case "effects":
          state.effects = isOff(val) ? [] : parseEffects(val, (n) => warn(ln, `Efecto desconocido: "${n}". Usa: ${EFFECTS.map((e) => e.id).join(", ")}`));
          break;
        case "focus": {
          const f = norm(val);
          const map: Record<string, Focus> = { a: "A", b: "B", c: "C", ambos: "ambos", todos: "ambos", ninguno: "ninguno", "-": "ninguno" };
          if (map[f]) state.focus = map[f];
          else warn(ln, "foco: A | B | C | ambos | ninguno");
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
          if (l === "duo" || l === "trio" || l === "centro") state.layout = l;
          else warn(ln, "layout: duo | trio | centro");
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
  if (frames.length === 0) diagnostics.push({ line: 1, level: "info", msg: 'Aún no hay líneas de narración. Escribe una línea que empiece con ">"' });

  let t = 0;
  for (const b of beats) {
    b.start = Math.round(t * 100) / 100;
    let ft = t;
    for (let k = b.firstFrame; k < b.firstFrame + b.frameCount; k++) {
      frames[k].start = Math.round(ft * 100) / 100;
      ft += frames[k].duration;
    }
    t += b.duration;
  }

  return { meta, subjects, poses, scenes, beats, frames, globalStyle, diagnostics, totalDuration: Math.round(t * 10) / 10 };
}

/** Índice de la primera imagen que corresponde a una línea del editor */
export function frameAtLine(frames: Frame[], line: number): number {
  let found = -1;
  for (const f of frames) {
    if (f.line <= line) {
      if (found === -1 || frames[found].line !== f.line) found = f.index;
    } else break;
  }
  if (found === -1 && frames.length) return 0;
  return found;
}
