import {
  Anton,
  Archivo_Black,
  Bebas_Neue,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Montserrat,
  Poppins,
  Space_Grotesk,
} from "next/font/google";
import type { FontKey } from "@/lib/dsl/template";

// ── Interfaz del estudio
export const uiSans = Space_Grotesk({ subsets: ["latin"], variable: "--font-ui" });
export const uiSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
export const uiMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

// ── Fuentes disponibles dentro de los fotogramas
const montserrat = Montserrat({ subsets: ["latin"], variable: "--f-montserrat" });
const inter = Inter({ subsets: ["latin"], variable: "--f-inter" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--f-anton" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--f-bebas" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--f-poppins" });
const archivo = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--f-archivo" });

export const frameFontVars = [montserrat, inter, anton, bebas, poppins, archivo].map((f) => f.variable).join(" ");

export const FRAME_FONTS: Record<FontKey, string> = {
  montserrat: montserrat.style.fontFamily,
  inter: inter.style.fontFamily,
  anton: anton.style.fontFamily,
  bebas: bebas.style.fontFamily,
  poppins: poppins.style.fontFamily,
  archivo: archivo.style.fontFamily,
  serif: uiSerif.style.fontFamily,
};
