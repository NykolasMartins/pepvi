import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import Nav from "./Nav";
import "./globals.css";

// next/font baixa e hospeda localmente: sem requisição a terceiros e sem salto
// de layout quando a fonte carrega.
const texto = Inter({
  subsets: ["latin"],
  variable: "--fonte-texto",
  display: "swap",
});

const titulo = Outfit({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--fonte-titulo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PEPVI — redação contra o tempo",
  description:
    "Treino de redação dissertativo-argumentativa do ENEM com cronômetro, correção por IA e XP.",
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  // O usuário fotografa a folha no celular e depois lê a correção: precisa
  // poder dar zoom. Travar a escala é uma barreira de acessibilidade.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable}`}>
      <body className="min-h-screen bg-fundo font-sans text-zinc-100 antialiased">
        <Nav />
        {/* Espaço para a barra fixa: embaixo no celular, em cima no desktop. */}
        <div className="pb-20 sm:pb-0 sm:pt-16">{children}</div>
      </body>
    </html>
  );
}
