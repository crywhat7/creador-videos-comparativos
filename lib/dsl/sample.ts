export const SAMPLE_SCRIPT = `# ─────────────────────────────────────────────
#  VSL · Lenguaje de guion para videos "Versus"
#  Cada línea que empieza con  >  es UN fotograma
#  (una imagen + una línea de narración).
#  Todo lo demás "persiste": lo que no cambies,
#  se mantiene en los siguientes fotogramas.
# ─────────────────────────────────────────────

@titulo  Missile vs Rocket
@idioma  en
@voz     Narrador masculino, curioso y cercano. Ritmo ágil de Shorts.
@ritmo   2.6
@formato 1080x1920

# ── Sujetos: lo que puede ir en A o en B ──
sujeto misil "Missile"
  imagen: Misil balístico AGNI-V verde oliva con punta negra y franja blanca, diagonal 45°, fondo blanco

sujeto cohete "Rocket"
  imagen: Cohete RPG PG-7VL verde con aletas metálicas, diagonal 45°, fondo blanco

sujeto crucero "Cruise\\nMissile"
  imagen: Misil de crucero blanco tipo Tomahawk con alas pequeñas, diagonal, fondo blanco

sujeto balistico "Ballistic\\nMissile"
  imagen: Misil balístico Minuteman verde con franjas blancas y negras, diagonal, fondo blanco

sujeto hiper "Hypersonic\\nMissile"
  imagen: Planeador hipersónico negro con estela de fuego, diagonal, fondo blanco

sujeto super "Supersonic\\nMissile"
  imagen: Misil supersónico BrahMos blanco con banderas, diagonal, fondo blanco

# ── Poses con nombre (opcional) ──
pose senala-a: apunta-izq feliz
pose senala-b: apunta-der feliz

# ═══════════════════════════════════════════════

== Gancho
A: hiper
B: super
muneco: duda duda
texto: What's the difference?
> [curioso] What's the difference?

nota: Pausa dramática antes de responder
muneco: senala-a
texto: flies faster than
> [pausa 0.3] A supersonic missile flies faster than the speed of sound

== Supersónico
muneco: apunta-der picaro
texto: supersonic missile.
> This is a supersonic missile

== Misil vs cohete
A: misil
B: cohete
muneco: senala-a
texto: change its direction
foco: A
> A missile can change its direction to follow

texto: while a rocket
muneco: senala-b
foco: B
> while a rocket flies straight after it's launched

foco: ambos
muneco: apunta-der picaro
texto: This is a rocket.
sub: off
> This is a rocket. {1.8s}
sub: on

== Tipos de misil
A: crucero
B: -
muneco: apunta-izq picaro
texto: This is a cruise missile.
> This is a cruise missile

B: balistico
muneco: apunta-der picaro
texto: This is a ballistic missile.
extra velocidad: "MACH 20+" (x:78, y:47, tam:44, color:acento, rot:-6)
> This is a ballistic missile [énfasis]
extra velocidad: -
`;
