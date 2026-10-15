import { BUILTIN_POSES, EFFECTS, FACES } from "./parser";
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
      "Un guion VSL es una lista de líneas de voz. Cada línea que empieza con > es una frase narrada; el rótulo grande del centro la va mostrando en trozos cortos (tipo karaoke) y cada trozo es UNA imagen del video. Las propiedades (A:, B:, muneco:, efecto:…) describen lo que se ve y persisten hasta que las cambies.",
    entries: [],
  },
  {
    title: "Cabecera",
    entries: [
      { syntax: "@titulo Texto", desc: "Nombre del video." },
      { syntax: "@idioma es", desc: "Idioma de la narración (es, en, pt…)." },
      { syntax: "@voz descripción", desc: "Tono y casting para la IA de voz." },
      { syntax: "@ritmo 2.6", desc: "Palabras por segundo para estimar duraciones." },
      { syntax: "@palabras 3", desc: "Palabras máximas por trozo del rótulo central (karaoke)." },
      { syntax: "@formato 1080x1920", desc: "Resolución de exportación." },
      { syntax: "@estilo clave valor", desc: "Sobrescribe la plantilla para todo el guion.", example: "@estilo titulos.tam 90" },
      {
        syntax: "@estilo subtitulo.visible no",
        desc: "Oculta un elemento en todo el video. Sirve con titulos, imagenes, texto, muneco, subtitulo y extra.",
      },
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
      { syntax: "> narración", desc: "Una línea de voz. Se corta sola en trozos de @palabras; cada trozo es una imagen. El subtítulo de abajo muestra la frase completa." },
      { syntax: "> trozo uno / trozo dos / tres", desc: "Cortes manuales del rótulo: cada ' / ' (con espacios) inicia una imagen nueva. La barra no se lee ni se ve." },
      { syntax: "> narración | subtítulo", desc: "Subtítulo distinto a lo que se narra." },
      { syntax: "> texto [emoción] [pausa 0.5]", desc: "Etiquetas de voz: la IA las interpreta, no se leen ni se ven." },
      { syntax: "> texto {2.5s, sin-sub, entero, palabras:2, efecto:destello}", desc: "Opciones solo para esta línea: duración fija, ocultar subtítulo, no cortar el rótulo, trozos de otro tamaño, efecto puntual (varios con +)." },
      { syntax: "nota: texto", desc: "Nota de dirección para la siguiente línea (no se ve)." },
      { syntax: "limpiar", desc: "Vacía todo el estado visual." },
    ],
  },
  {
    title: "Propiedades visuales (persisten)",
    entries: [
      { syntax: "A: id | B: id", desc: 'Sujeto en el lado izquierdo / derecho. "-" lo vacía. A: id "Otro título" sobrescribe el título; A: "Texto" usa un título suelto.' },
      { syntax: "C: id", desc: "Tercer sujeto: al usarlo la pantalla pasa a tres columnas (A izquierda, B al medio, C derecha). C: - vuelve a dos.", example: "A: misil\nB: cohete\nC: dron\nmuneco: apunta-centro feliz\nfoco: B" },
      { syntax: "muneco: pose [cara]", desc: '"-" lo oculta.', example: "muneco: apunta-der picaro" },
      { syntax: "texto: auto | frase | -", desc: "Rótulo grande del centro. auto (por defecto) = la narración en trozos tipo karaoke. Una frase = texto fijo (una imagen por línea). - = sin rótulo." },
      { syntax: "palabras: 2", desc: "Cambia el tamaño de los trozos desde aquí." },
      { syntax: "efecto: lineas-anime, temblor", desc: "Efectos visuales (persisten). - los quita. Ver sección Efectos." },
      { syntax: "foco: A | B | C | ambos | ninguno", desc: "Atenúa los sujetos que no están en foco. ambos = todos visibles." },
      { syntax: "layout: duo | trio | centro", desc: "duo/trio se eligen solos según haya C. centro = un solo sujeto (A) grande al medio." },
      { syntax: "sub: on | off", desc: "Mostrar u ocultar el subtítulo de abajo desde aquí (para todo el video: @estilo subtitulo.visible no)." },
      { syntax: "fondo: #f5f1e8", desc: "Color de fondo (también acento, tinta, suave)." },
      { syntax: 'extra id: "texto" (x:70, y:45, tam:48, color:acento, peso:800, rot:-6, fondo:#ff0, fuente:anton, alinear:centro)', desc: 'Texto adicional en % del lienzo. "extra id: -" lo quita.' },
      { syntax: "estilo clave: valor", desc: "Override de plantilla desde aquí en adelante. Valor - lo quita.", example: "estilo texto.color: acento" },
    ],
  },
];

SPEC.push({
  title: "Efectos",
  intro: "Se combinan con comas y aceptan opciones entre paréntesis. Los colores e intensidades por defecto se cambian en Diseño → Efectos o con @estilo efectos.clave valor.",
  entries: EFFECTS.map((e) => ({ syntax: e.example, desc: `${e.label}: ${e.desc}` })),
});

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
- Cada línea ">" es una frase de voz (6 a 14 palabras). El rótulo central la muestra sola en trozos tipo karaoke; NO escribas texto: salvo que quieras un rótulo fijo.
- Si un corte automático queda raro, marca los trozos con " / " (ej: > A missile can / change its direction / to follow).
- Reutiliza la misma composición (A/B) en varias líneas seguidas y solo cambia la pose del muñeco, el foco o los efectos.
- Usa efectos para picos de atención (gancho, revelación, dato fuerte), no en todas las líneas.
- Usa foco: para dirigir la atención al sujeto del que se habla, y una pose que apunte hacia él (apunta-izq = A, apunta-der = B; con tres sujetos: apunta-izq = A, apunta-centro = B, apunta-der = C).
- Define cada sujeto con un prompt de imagen claro: objeto completo, diagonal, fondo blanco, sin texto.
- Usa etiquetas de voz [curioso] [énfasis] [pausa 0.4] con moderación.

${specAsMarkdown()}

## Ejemplo completo

\`\`\`
${sample}
\`\`\`
`;
}
