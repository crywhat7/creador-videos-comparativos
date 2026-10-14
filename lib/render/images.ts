/** Caché de imágenes para el canvas con notificación al terminar de cargar. */
type Entry = { img: HTMLImageElement; ready: boolean; failed: boolean; promise: Promise<HTMLImageElement | null> };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let scheduled = false;

function notify() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    listeners.forEach((l) => l());
  });
}

export function onImagesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function load(src: string): Entry {
  let e = cache.get(src);
  if (e) return e;
  const img = new Image();
  if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
  const entry: Entry = {
    img,
    ready: false,
    failed: false,
    promise: new Promise((resolve) => {
      img.onload = () => {
        entry.ready = true;
        notify();
        resolve(img);
      };
      img.onerror = () => {
        entry.failed = true;
        notify();
        resolve(null);
      };
    }),
  };
  img.src = src;
  cache.set(src, entry);
  e = entry;
  return e;
}

/** Devuelve la imagen si ya está lista; si no, la empieza a cargar y devuelve null. */
export function getImage(src: string | null | undefined): HTMLImageElement | null {
  if (!src) return null;
  const e = load(src);
  return e.ready ? e.img : null;
}

export function imageFailed(src: string | null | undefined): boolean {
  return !!src && !!cache.get(src)?.failed;
}

export function preloadImages(srcs: (string | null | undefined)[]): Promise<unknown> {
  return Promise.all(srcs.filter(Boolean).map((s) => load(s as string).promise));
}
