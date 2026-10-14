"use client";

import { useState } from "react";
import JSZip from "jszip";
import { frameFileName, slug, toImageList, toNarrationMarkdown, toPlainText, toSRT, toTimeline } from "@/lib/export/exporters";
import { allSources, renderFrame, type RenderContext } from "@/lib/render/renderer";
import { preloadImages } from "@/lib/render/images";
import { llmPrompt } from "@/lib/dsl/spec";
import { SAMPLE_SCRIPT } from "@/lib/dsl/sample";
import { download } from "@/lib/storage";
import type { Template } from "@/lib/dsl/template";

interface Props {
  rc: RenderContext;
  source: string;
  onImport: (p: { script: string; template?: Template; assets?: Record<string, string> }) => void;
}

function Row({
  id,
  title,
  desc,
  onCopy,
  onDownload,
  onDownloadAlt,
  altLabel,
  primary,
  flash,
}: {
  id: string;
  title: string;
  desc: string;
  onCopy?: () => void;
  onDownload?: () => void;
  onDownloadAlt?: () => void;
  altLabel?: string;
  primary?: boolean;
  flash: string | null;
}) {
  return (
    <div className={`rounded-xl border p-3 ${primary ? "border-accent/50 bg-accent-soft" : "border-line bg-panel-2"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[14px] font-semibold">{title}</h4>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">{desc}</p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {onCopy && (
          <button type="button" onClick={onCopy} className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] transition-colors hover:border-accent hover:text-accent">
            {flash === id ? "Copiado ✓" : "Copiar"}
          </button>
        )}
        {onDownload && (
          <button type="button" onClick={onDownload} className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] transition-colors hover:border-accent hover:text-accent">
            Descargar
          </button>
        )}
        {onDownloadAlt && (
          <button type="button" onClick={onDownloadAlt} className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] transition-colors hover:border-accent hover:text-accent">
            {altLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}

export function ExportPanel({ rc, source, onImport }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const script = rc.script;
  const base = slug(script.meta.titulo);

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setFlash(id);
    setTimeout(() => setFlash(null), 1400);
  };

  const exportZip = async () => {
    if (!script.frames.length) return;
    setProgress(0);
    try {
      await document.fonts.ready;
      await preloadImages(allSources(rc));
      const zip = new JSZip();
      const dir = zip.folder("fotogramas")!;
      const c = document.createElement("canvas");
      c.width = script.meta.ancho;
      c.height = script.meta.alto;
      const ctx = c.getContext("2d")!;
      for (const f of script.frames) {
        renderFrame(ctx, f, rc, c.width, c.height);
        dir.file(frameFileName(f), await canvasBlob(c));
        setProgress((f.index + 1) / script.frames.length);
      }
      zip.file("guion-voz.md", toNarrationMarkdown(script));
      zip.file("narracion.txt", toPlainText(script));
      zip.file("subtitulos.srt", toSRT(script));
      zip.file("subtitulos-trozos.srt", toSRT(script, true));
      zip.file("linea-de-tiempo.json", JSON.stringify(toTimeline(script), null, 2));
      zip.file("guion.vsl", source);
      download(`${base}.zip`, await zip.generateAsync({ type: "blob" }));
    } finally {
      setProgress(null);
    }
  };

  const exportProject = () => {
    download(
      `${base}.versus.json`,
      JSON.stringify({ formato: "versus-proyecto/1", script: source, template: rc.template, assets: rc.assets }, null, 2),
      "application/json",
    );
  };

  const importProject = (file: File) => {
    file.text().then((txt) => {
      if (file.name.endsWith(".vsl") || file.name.endsWith(".txt")) return onImport({ script: txt });
      try {
        const p = JSON.parse(txt);
        if (typeof p.script === "string") onImport({ script: p.script, template: p.template, assets: p.assets });
      } catch {
        alert("No se pudo leer el archivo de proyecto.");
      }
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl border border-line bg-panel-2 p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Paquete completo</p>
        <h3 className="mt-1 font-display text-[26px] leading-none italic">Fotogramas + guion</h3>
        <p className="mt-2 text-[12px] leading-snug text-muted">
          ZIP con las {script.frames.length} imágenes PNG ({script.beats.length} líneas de voz) en {script.meta.ancho}×{script.meta.alto}, numerados en orden, más el guion para la voz, SRT, JSON de línea de tiempo y el .vsl.
        </p>
        <button
          type="button"
          disabled={progress !== null || !script.frames.length}
          onClick={exportZip}
          className="relative mt-3 w-full overflow-hidden rounded-lg bg-accent px-3 py-2.5 text-[13px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
        >
          {progress !== null && (
            <span className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          )}
          <span className="relative">{progress !== null ? `Renderizando… ${Math.round(progress * 100)}%` : "Exportar .zip"}</span>
        </button>
      </div>

      <Row
        flash={flash}
        id="md"
        primary
        title="Guion para la IA de voz"
        desc="Markdown con instrucciones, texto continuo y cada línea sincronizada con su imagen. Pégalo tal cual en tu IA."
        onCopy={() => copy("md", toNarrationMarkdown(script))}
        onDownload={() => download(`${base}-guion-voz.md`, toNarrationMarkdown(script), "text/markdown;charset=utf-8")}
      />
      <Row
        flash={flash}
        id="txt"
        title="Solo narración"
        desc="Una línea por fotograma, con etiquetas de voz [ ]. Para generadores de voz directos."
        onCopy={() => copy("txt", toPlainText(script))}
        onDownload={() => download(`${base}-narracion.txt`, toPlainText(script))}
      />
      <Row
        flash={flash}
        id="json"
        title="Línea de tiempo (JSON)"
        desc="Estructura completa: tiempos, narración, subtítulos y lo que se ve en cada fotograma. Ideal para automatizar."
        onCopy={() => copy("json", JSON.stringify(toTimeline(script), null, 2))}
        onDownload={() => download(`${base}-linea-de-tiempo.json`, JSON.stringify(toTimeline(script), null, 2), "application/json")}
      />
      <Row
        flash={flash}
        id="srt"
        title="Subtítulos .srt"
        desc="Uno por línea de voz, o por trozo del rótulo (estilo karaoke). Tiempos estimados según @ritmo."
        onDownload={() => download(`${base}.srt`, toSRT(script))}
        onDownloadAlt={() => download(`${base}-trozos.srt`, toSRT(script, true))}
        altLabel="Por trozo"
      />
      <Row
        flash={flash}
        id="img"
        title="Lista de imágenes a generar"
        desc="Checklist de sujetos con sus prompts y las poses del muñeco que se usan."
        onCopy={() => copy("img", toImageList(script, rc.assets))}
        onDownload={() => download(`${base}-imagenes.md`, toImageList(script, rc.assets), "text/markdown;charset=utf-8")}
      />
      <Row
        flash={flash}
        id="llm"
        title="Prompt para escribir guiones con IA"
        desc="Especificación del lenguaje VSL + reglas de estilo + ejemplo. Pásaselo a ChatGPT o Claude con tu tema."
        onCopy={() => copy("llm", llmPrompt(SAMPLE_SCRIPT))}
      />

      <div className="rounded-xl border border-line bg-panel-2 p-3">
        <h4 className="text-[14px] font-semibold">Proyecto</h4>
        <p className="mt-0.5 text-[12px] text-muted">Guion, plantilla e imágenes en un solo archivo. Se guarda solo en este navegador mientras trabajas.</p>
        <div className="mt-2.5 flex gap-1.5">
          <button type="button" onClick={exportProject} className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] transition-colors hover:border-accent hover:text-accent">
            Guardar .versus.json
          </button>
          <label className="cursor-pointer rounded-md border border-line-strong px-2.5 py-1 text-[12px] transition-colors hover:border-accent hover:text-accent">
            Abrir…
            <input
              type="file"
              accept=".json,.vsl,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importProject(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => download(`${base}.vsl`, source)}
            className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted transition-colors hover:text-text"
          >
            .vsl
          </button>
        </div>
      </div>
    </div>
  );
}
