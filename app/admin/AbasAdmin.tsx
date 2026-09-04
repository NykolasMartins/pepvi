"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/admin", rotulo: "Visão geral" },
  { href: "/admin/ia", rotulo: "Custo e cota" },
  { href: "/admin/qualidade", rotulo: "Qualidade" },
  { href: "/admin/saude", rotulo: "Saúde" },
  { href: "/admin/redacoes", rotulo: "Redações" },
  { href: "/admin/conteudo", rotulo: "Conteúdo" },
] as const;

export default function AbasAdmin() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções da administração"
      className="-mx-5 overflow-x-auto px-5"
    >
      <ul className="flex min-w-max gap-1 rounded-lg bg-zinc-900 p-1">
        {ABAS.map((aba) => {
          // "/admin" só casa exato: com startsWith, a visão geral ficaria
          // marcada como ativa em todas as abas.
          const ativa =
            aba.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(aba.href);
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                aria-current={ativa ? "page" : undefined}
                className={`block whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
                  ativa
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {aba.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
