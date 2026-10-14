# Versus — estudio de guiones para videos comparativos

Escribe el guion en **VSL** (un lenguaje de guion sencillo), mira cada fotograma en vivo y exporta:

- los **PNG** de cada fotograma (1080×1920, numerados en orden),
- el **guion para la IA de voz** (Markdown con instrucciones + líneas sincronizadas con cada imagen),
- narración en texto plano, **SRT**, **JSON** de línea de tiempo y la lista de imágenes a generar,
- un **prompt** con la especificación del lenguaje para que ChatGPT/Claude escriban guiones nuevos.

```bash
npm run dev
```

## VSL en 30 segundos

```
@titulo Missile vs Rocket
@voz    Narrador curioso, ritmo ágil

sujeto misil "Missile"
  imagen: Misil AGNI-V diagonal, fondo blanco

== Misil vs cohete
A: misil
B: cohete
muneco: apunta-izq feliz
texto: change its direction
foco: A
> A missile can change its direction to follow
texto: while a rocket
muneco: apunta-der feliz
foco: B
> while a rocket flies straight after it's launched
```

- Cada línea `>` = un fotograma (imagen + línea de narración).
- Las propiedades (`A:`, `B:`, `muneco:`, `texto:`, `foco:`…) **persisten** hasta que las cambies.
- `[curioso]`, `[pausa 0.5]` = dirección de voz (no se lee ni se ve). `| texto` = subtítulo distinto. `{2s, sin-sub}` = opciones del fotograma.
- `@estilo grupo.clave valor` cambia cualquier parte de la plantilla (tamaños, posiciones, fuentes, colores).

La referencia completa está en la pestaña **Lenguaje** del estudio.

## Estructura

- `lib/dsl/` — parser, tipos, plantilla visual, especificación y ejemplo.
- `lib/render/` — renderizador canvas (el mismo para vista previa y exportación) y el muñeco SVG.
- `lib/export/` — exportadores (Markdown de voz, SRT, JSON, lista de imágenes).
- `components/studio/` — interfaz: editor, escenario, inspector.

El proyecto se autoguarda en el navegador (guion y plantilla en localStorage, imágenes en IndexedDB). Usa **Exportar → Guardar .versus.json** para respaldarlo o moverlo a otro equipo.
