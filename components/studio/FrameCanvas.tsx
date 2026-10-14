"use client";

import { useEffect, useRef } from "react";
import { renderFrame, type RenderContext } from "@/lib/render/renderer";
import type { Frame } from "@/lib/dsl/types";

interface Props {
  frame: Frame | null;
  rc: RenderContext;
  /** ancho CSS en px */
  width: number;
  version: number;
  className?: string;
}

/** Dibuja un fotograma con el mismo renderizador que la exportación (WYSIWYG). */
export function FrameCanvas({ frame, rc, width, version, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { ancho, alto } = rc.script.meta;
  const height = Math.round((width * alto) / ancho);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext("2d");
    if (ctx) renderFrame(ctx, frame, rc, w, h);
  }, [frame, rc, width, height, version]);

  return <canvas ref={ref} className={className} style={{ width, height }} />;
}
