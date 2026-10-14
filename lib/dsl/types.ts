export type Level = "error" | "warn" | "info";

export interface Diagnostic {
  line: number; // 1-based
  level: Level;
  msg: string;
}

export interface Subject {
  id: string;
  title: string;
  prompt?: string;
  file?: string;
  note?: string;
  scale?: number;
  rotation?: number;
  dx?: number;
  dy?: number;
  titleColor?: string;
  line: number;
}

export interface PoseDef {
  id: string;
  base: string;
  face?: string;
  prompt?: string;
  file?: string;
  mirror?: boolean;
  line: number;
}

export interface ExtraText {
  id: string;
  text: string;
  x: number; // % del lienzo
  y: number; // % del lienzo
  size?: number;
  color?: string;
  weight?: number;
  font?: string;
  align?: "izq" | "centro" | "der";
  rotation?: number;
  bg?: string;
}

export interface Effect {
  name: string;
  opts: Record<string, string>;
}

export interface SlotRef {
  subjectId?: string;
  title?: string; // título sobrescrito o literal
}

export type Focus = "A" | "B" | "ambos" | "ninguno";
export type Layout = "duo" | "centro";
/** auto = el rótulo central muestra la narración en trozos (karaoke) */
export type CaptionMode = "auto" | "fijo" | "off";

export interface VisualState {
  A: SlotRef | null;
  B: SlotRef | null;
  mascot: string | null; // "apunta-izq feliz" o alias de pose
  captionMode: CaptionMode;
  caption: string | null; // texto fijo cuando captionMode = "fijo"
  words: number; // palabras máximas por trozo en modo auto
  focus: Focus;
  subs: boolean;
  extras: Record<string, ExtraText>;
  effects: Effect[];
  background: string | null;
  layout: Layout;
  style: Record<string, string>;
}

/** Una línea de narración ( > ... ). Puede producir varias imágenes. */
export interface Beat {
  index: number;
  line: number;
  scene: string;
  sceneIndex: number;
  narration: string; // con etiquetas de voz [..]
  clean: string; // sin etiquetas
  subtitle: string | null;
  duration: number;
  start: number;
  explicitDuration: boolean;
  note: string | null;
  firstFrame: number;
  frameCount: number;
}

/** Una imagen del video. */
export interface Frame {
  index: number; // 0-based
  line: number;
  scene: string;
  sceneIndex: number;
  beat: number;
  chunkIndex: number;
  chunkCount: number;
  caption: string | null; // texto central resuelto para esta imagen
  narration: string;
  clean: string;
  subtitle: string | null;
  duration: number;
  start: number;
  explicitDuration: boolean;
  note: string | null;
  state: VisualState;
}

export interface Scene {
  index: number;
  title: string;
  line: number;
  firstFrame: number;
  frameCount: number;
}

export interface Meta {
  titulo: string;
  idioma: string;
  voz: string;
  ritmo: number; // palabras por segundo
  palabras: number; // palabras por trozo de rótulo
  ancho: number;
  alto: number;
  otros: Record<string, string>;
}

export interface ParsedScript {
  meta: Meta;
  subjects: Record<string, Subject>;
  poses: Record<string, PoseDef>;
  scenes: Scene[];
  beats: Beat[];
  frames: Frame[];
  globalStyle: Record<string, string>;
  diagnostics: Diagnostic[];
  totalDuration: number;
}
