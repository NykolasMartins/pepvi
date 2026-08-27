import Link from "next/link";
import { getRanking } from "@/app/actions";
import { supabaseUser } from "@/lib/supabase";
import NomeDeExibicao from "./NomeDeExibicao";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { id: "semana", rotulo: "Semana", nota: "desde segunda-feira" },
  { id: "mes", rotulo: "Mês", nota: "desde o dia 1º" },
  { id: "historico", rotulo: "Histórico", nota: "desde sempre" },
] as const;

type Periodo = (typeof PERIODOS)[number]["id"];

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const periodo: Periodo = PERIODOS.some((x) => x.id === p) ? (p as Periodo) : "semana";

  const supabase = await supabaseUser();
  const [linhas, { data: profile }] = await Promise.all([
    getRanking(periodo),
    supabase.from("profiles").select("username").maybeSingle(),
  ]);

  const meu = linhas.find((l) => l.eu);
  const info = PERIODOS.find((x) => x.id === periodo)!;

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Ranking</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Por XP acumulado · {info.nota}
          </p>
        </div>

      </header>

      {/* Abas como links: o período é estado de URL, então é compartilhável,
          volta no histórico do navegador e não precisa de JavaScript. */}
      <nav className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {PERIODOS.map((x) => (
          <Link
            key={x.id}
            href={`/ranking?p=${x.id}`}
            aria-current={periodo === x.id ? "page" : undefined}
            className={`flex-1 rounded-md px-4 py-3 text-center text-sm font-medium transition ${
              periodo === x.id
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {x.rotulo}
          </Link>
        ))}
      </nav>

      <NomeDeExibicao atual={profile?.username ?? ""} />

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          Ninguém pontuou {periodo === "historico" ? "ainda" : "neste período"}.
          {periodo !== "historico" && " Uma redação corrigida já coloca você aqui."}
        </p>
      ) : (
        <ol className="space-y-1">
          {linhas.map((l) => (
            <li
              key={l.posicao}
              className={`flex items-center gap-4 rounded-lg border p-3 ${
                l.eu
                  ? "border-emerald-800 bg-emerald-950/30"
                  : "border-transparent bg-zinc-900/50"
              }`}
            >
              <span
                className={`w-8 shrink-0 text-center font-mono text-sm font-bold ${
                  l.posicao === 1
                    ? "text-amber-400"
                    : l.posicao <= 3
                      ? "text-zinc-300"
                      : "text-zinc-600"
                }`}
              >
                {l.posicao}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${l.eu ? "font-semibold text-emerald-300" : "text-zinc-300"}`}>
                {l.username}
                {l.eu && <span className="ml-2 text-xs text-emerald-600">você</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm font-bold tabular-nums">
                  {Number(l.xp).toLocaleString("pt-BR")}
                </span>
                <span className="block text-xs text-zinc-600">
                  {l.partidas} partida{Number(l.partidas) === 1 ? "" : "s"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {linhas.length > 0 && !meu && (
        <p className="text-center text-xs text-zinc-600">
          Você ainda não pontuou {periodo === "historico" ? "" : "neste período"} —
          uma redação corrigida já coloca você na lista.
        </p>
      )}

      <p className="text-xs leading-relaxed text-zinc-600">
        Empate em XP é desfeito por <strong className="text-zinc-500">menos partidas</strong>:
        a mesma pontuação com menos redações é melhor aproveitamento.
      </p>
    </main>
  );
}
