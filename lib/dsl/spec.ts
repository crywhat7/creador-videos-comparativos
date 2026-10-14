import { BUILTIN_POSES, FACES } from "./parser";
import { styleKeys } from "./template";

export interface SpecEntry {
  syntax: string;
  desc: string;
  example?: string;
}

export interface SpecSection {
  title: string;
  intro?: string;
  entries: SpecEntry[];
}

export const SPEC: SpecSection[] = [
  {
    title: "La idea",
    intro:
      "Un guion VSL es una lista de fotogramas. Cada línea que empieza con > produce UNA imagen y UNA línea de narración. Las propiedades (A:, B:, muneco:, texto:…) describen lo que se ve y persisten hasta que las cambies, así que para repetir la misma imagen con otro subtítulo basta con escribir otra línea >.",
    entries: [],
  },
  {
    title: "Cabecera",
    entries: [
      { syntax: "@titulo Texto", desc: "Nombre del video." },
      { syntax: "@idioma es", desc: "Idioma de la narración (es, en, pt…)." },
      { syntax: "@voz descripción", desc: "Tono y casting para la IA de voz." },
      { syntax: "@ritmo 2.6", desc: "Palabras por segundo para estimar duraciones." },
      { syntax: "@formato 1080x1920", desc: "Resolución de exportación." },
      { syntax: "@estilo clave valor", desc: "Sobrescribe la plantilla para todo el guion.", example: "@estilo titulos.tam 90" },
      { syntax: "@cualquiera valor", desc: "Metadato libre; se exporta tal cual (ej: @canal, @cta)." },
    ],
  },
  {
    title: "Sujetos y poses",
    entries: [
      {
        syntax: 'sujeto id "Título"',
        desc: "Define algo comparable. Las líneas indentadas debajo son sus propiedades: imagen (prompt), archivo, titulo, escala, rotacion, x, y, color, nota. Usa \\n para cortar el título.",
        example: 'sujeto misil "Missile"\n  imagen: Misil AGNI-V, fondo blanco\n  escala: 1.1',
      },
      {
        syntax: "pose id: base cara",
        desc: `Alias de pose del muñeco. Bases: ${BUILTIN_POSES.join(", ")}. Caras: ${FACES.join(", ")}. Propiedades indentadas: archivo, imagen, espejo.`,
        example: "pose senala-a: apunta-izq feliz",
      },
    ],
  },
  {
    title: "Escenas y fotogramas",
    entries: [
      { syntax: "== Título de escena", desc: "Agrupa fotogramas. No borra el estado visual." },
      { syntax: "> narración", desc: "Un fotograma. El subtítulo muestra la narración sin etiquetas." },
      { syntax: "> narración | subtítulo", desc: "Subtítulo distinto a lo que se narra." },
      { syntax: "> texto [emoción] [pausa 0.5]", desc: "Etiquetas de voz: la IA las interpreta, no se leen ni se ven." },
      { syntax: "> texto {2.5s, sin-sub}", desc: "Opciones solo para este fotograma: duración fija y/o ocultar subtítulo." },
      { syntax: "nota: texto", desc: "Nota de dirección para el siguiente fotograma (no se ve)." },
      { syntax: "limpiar", desc: "Vacía todo el estado visual." },
    ],
  },
  {
    title: "Propiedades visuales (persisten)",
    entries: [
      { syntax: "A: id | B: id", desc: 'Sujeto en el lado izquierdo / derecho. "-" lo vacía. A: id "Otro título" sobrescribe el título; A: "Texto" usa un título suelto.' },
      { syntax: "muneco: pose [cara]", desc: '"-" lo oculta.', example: "muneco: apunta-der picaro" },
      { syntax: "texto: frase", desc: "Rótulo grande sobre el muñeco." },
      { syntax: "foco: A | B | ambos | ninguno", desc: "Atenúa el lado que no está en foco." },
      { syntax: "layout: duo | centro", desc: "centro = un solo sujeto (A) grande al medio." },
      { syntax: "sub: on | off", desc: "Mostrar u ocultar subtítulos desde aquí." },
      { syntax: "fondo: #f5f1e8", desc: "Color de fondo (también acento, tinta, suave)." },
      { syntax: 'extra id: "texto" (x:70, y:45, tam:48, color:acento, peso:800, rot:-6, fondo:#ff0, fuente:anton, alinear:centro)', desc: 'Texto adicional en % del lienzo. "extra id: -" lo quita.' },
      { syntax: "estilo clave: valor", desc: "Override de plantilla desde aquí en adelante. Valor - lo quita.", example: "estilo texto.color: acento" },
    ],
  },
];

export function specAsMarkdown(): string {
  const out: string[] = ["# VSL — lenguaje de guion para videos comparativos", ""];
  for (const s of SPEC) {
    out.push(`## ${s.title}`, "");
    if (s.intro) out.push(s.intro, "");
    for (const e of s.entries) {
      out.push(`- \`${e.syntax}\` — ${e.desc}`);
      if (e.example) out.push("  ```", ...e.example.split("\n").map((l) => "  " + l), "  ```");
    }
    out.push("");
  }
  out.push("## Claves de estilo disponibles", "", styleKeys().map((k) => `\`${k}\``).join(", "), "");
  return out.join("\n");
}

/** Prompt para que un LLM escriba guiones en VSL. */
export function llmPrompt(sample: string): string {
  return `Eres guionista de videos cortos verticales de comparación ("X vs Y") estilo explainer.
Escribe el guion en el lenguaje VSL descrito abajo. Devuelve SOLO el guion VSL, sin explicaciones.

Reglas de estilo:
- Cada línea ">" es una imagen en pantalla: frases cortas (6 a 14 palabras), una idea por línea.
- Reutiliza la misma composición (A/B) en varias líneas seguidas y solo cambia el subtítulo, el rótulo (texto:) o la pose del muñeco.
- Usa foco: para dirigir la atención al lado del que se habla, y una pose que apunte hacia ese lado (apunta-izq = A, apunta-der = B).
- El rótulo (texto:) es un fragmento clave de 2 a 5 palabras de lo que se narra.
- Define cada sujeto con un prompt de imagen claro: objeto completo, diagonal, fondo blanco, sin texto.
- Usa etiquetas de voz [curioso] [énfasis] [pausa 0.4] con moderación.

${specAsMarkdown()}

## Ejemplo completo

\`\`\`
${sample}
\`\`\`
`;
}
