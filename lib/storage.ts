import type { Template } from "./dsl/template";

const KEY = "versus:proyecto:v1";

export interface SavedProject {
  script: string;
  template: Template;
  updatedAt: number;
}

export function loadProject(): SavedProject | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedProject) : null;
  } catch {
    return null;
  }
}

export function saveProject(p: SavedProject) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

// ── Recursos (imágenes) en IndexedDB: pueden pesar varios MB
const DB = "versus-assets";
const STORE = "assets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAssets(): Promise<Record<string, string>> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const out: Record<string, string> = {};
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          out[String(c.key)] = c.value as string;
          c.continue();
        } else resolve(out);
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return {};
  }
}

export async function putAsset(key: string, dataUrl: string | null) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    if (dataUrl === null) tx.objectStore(STORE).delete(key);
    else tx.objectStore(STORE).put(dataUrl, key);
  } catch {
    /* sin IndexedDB: los recursos viven solo en memoria */
  }
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function download(name: string, data: Blob | string, type = "text/plain;charset=utf-8") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
