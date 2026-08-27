"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", rotulo: "Jogar", icone: "◎" },
  { href: "/progresso", rotulo: "Progresso", icone: "◔" },
  { href: "/duelos", rotulo: "Duelos", icone: "⚔" },
  { href: "/ranking", rotulo: "Ranking", icone: "≡" },
];

/**
 * Navegação persistente.
 *
 * Some em duas situações, e as duas são deliberadas:
 * - /login, porque não há para onde ir;
 * - /match/*, porque partida é tela de foco. Oferecer "ver ranking" com o
 *   cronômetro correndo é convidar o usuário a perder a própria partida.
 *
 * Barra inferior no celular e superior no desktop: o polegar alcança embaixo, e
 * o celular é o aparelho de quem fotografa a folha.
 */
export default function Nav() {
  const pathname = usePathname();

  if (pathname.startsWith("/login") || pathname.startsWith("/match/")) return null;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-borda/60 bg-fundo/90 backdrop-blur sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-4 sm:-translate-x-1/2 sm:rounded-full sm:border"
    >
      <ul className="mx-auto flex max-w-lg items-center justify-around gap-1 px-2 py-2 sm:gap-1 sm:px-2 sm:py-1.5">
        {ITENS.map((item) => {
          const ativo =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-xs font-medium transition sm:flex-row sm:gap-2 ${
                  ativo
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <span aria-hidden className="text-base leading-none sm:text-sm">
                  {item.icone}
                </span>
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
