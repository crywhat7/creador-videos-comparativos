import type { Metadata } from "next";
import { frameFontVars, uiMono, uiSans, uiSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Versus — estudio de guiones",
  description: "Escribe guiones de videos comparativos, previsualiza cada fotograma y exporta la narración para IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${uiSans.variable} ${uiSerif.variable} ${uiMono.variable} ${frameFontVars} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
