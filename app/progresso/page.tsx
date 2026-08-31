import Link from "next/link";
import { supabaseUser, unwrap } from "@/lib/supabase";
import { calcularProgresso, MIN_PARTIDAS_PARA_TENDENCIA, type PartidaConcluida } from "@/lib/stats";
import { nivelDe } from "@/lib/levels";
import CompetenciasChart from "./CompetenciasChart";
import BarraNivel from "./BarraNivel";

export const dynamic = "force-dynamic";

type LinhaBanco = {
  id: string;
  status: string;
  created_at: string;
  elapsed_seconds: number | null;
  raw_score: number | null;
  hint_penalty: number | null;
  speed_bonus: number | null;
  xp_final: number | null;
  is_replay: boolean;
  is_free: boolean;
  themes: { title: string } | null;
  corrections: { attempt: number; c1: number; c2: number; c3: number; c4: number; c5: number; raw_score: number }[];
  // Objeto, NÃO array: submissions.match_id é UNIQUE, então o PostgREST trata
  // como relação para-um e devolve o objeto — ou null quando não há envio.
  // Verificado contra o banco; `submissions[0]` quebraria com "reading '0' of null".
  submissions: { source: string | null } | null;
  match_hints: { cost_xp: number }[];
};

export default async function ProgressoPage() {
  const supabase = await supabaseUser();

  // RLS restringe a auth.uid(): não há filtro por user_id aqui de propósito.
  const linhas = unwrap(
    await supabase
      .from("matches")
      .select(
        "id, status, created_at, elapsed_seconds, raw_score, hint_penalty, speed_bonus, xp_final, is_replay, is_free, themes(title), corrections(attempt, c1, c2, c3, c4, c5, raw_score), submissions(source), match_hints(cost_xp)"
      )
      .order("created_at", { ascending: false })
  ) as unknown as LinhaBanco[];

  const iniciadas = linhas.filter((l) => l.status !== "cancelled").length;

  const concluidas: PartidaConcluida[] = linhas
    .filter((l) => l.corrections.length > 0)
    .map((l) => {
      // A correção que vale é a última tentativa — reprocessamento preserva as
      // anteriores, e usar a errada mostraria nota que o usuário já contestou.
      const c = [...l.corrections].sort((a, b) => b.attempt - a.attempt)[0];
      return {
        id: l.id,
        temaTitulo: l.themes?.title ?? "(tema removido)",
        criadaEm: l.created_at,
        status: l.status,
        expirada: l.status === "expired",
        isReplay: l.is_replay,
        livre: l.is_free,
        origem: l.submissions?.source ?? null,
        notaBruta: c.raw_score,
        xpFinal: l.xp_final ?? 0,
        penalidadeDicas: l.hint_penalty ?? 0,
        bonusVelocidade: l.speed_bonus ?? 0,
        dicasAbertas: l.match_hints.length,
        minutosGastos: Math.round((l.elapsed_seconds ?? 0) / 60),
        competencias: [c.c1, c.c2, c.c3, c.c4, c.c5],
      };
    });

  const p = calcularProgresso(concluidas, iniciadas);

  // Cronológico para o gráfico: da primeira à última.
  const cronologico = [...concluidas].sort(
    (a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm)
  );

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Seu progresso</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {p.concluidas === 0
              ? "Nenhuma redação corrigida ainda."
              : `${p.concluidas} redação${p.concluidas === 1 ? "" : "ões"} corrigida${p.concluidas === 1 ? "" : "s"}`}
          </p>
        </div>

      </header>

      {p.concluidas === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-800 p-10 text-center">
          <p className="text-sm text-zinc-400">
            As estatísticas aparecem depois da primeira correção.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-emerald-950"
          >
            jogar a primeira partida
          </Link>
        </section>
      ) : (
        <>
          <BarraNivel nivel={nivelDe(p.xpTotal)} xpTotal={p.xpTotal} />

          {/* ---------- números principais ---------- */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card rotulo="Partidas" valor={p.concluidas} />
            <Card
              rotulo="Nota média"
              valor={Math.round(p.notaMedia!)}
              sufixo="/1000"
            />
            <Card rotulo="Melhor nota" valor={p.melhorNota!} sufixo="/1000" />
            <Card
              rotulo="Tempo médio"
              valor={Math.round(p.minutosMedios!)}
              sufixo="min"
            />
          </section>

          <CompetenciasChart
            medias={p.mediaPorCompetencia!}
            tendencias={p.tendenciaPorCompetencia}
            maisFraca={p.competenciaMaisFraca}
            minPartidasParaTendencia={MIN_PARTIDAS_PARA_TENDENCIA}
          />

          {/* ---------- evolução da nota ---------- */}
          {cronologico.length >= 2 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Evolução da nota
              </h2>
              <Grafico partidas={cronologico} />
            </section>
          )}

          {/* ---------- números secundários ---------- */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card
              rotulo="Dicas por partida"
              valor={p.dicasPorPartida!.toFixed(1)}
            />
            <Card
              rotulo="Taxa de conclusão"
              valor={p.taxaConclusao === null ? "—" : Math.round(p.taxaConclusao * 100)}
              sufixo={p.taxaConclusao === null ? "" : "%"}
            />
            <Card rotulo="Partidas iniciadas" valor={p.iniciadas} />
          </section>

          {/* ---------- histórico ---------- */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Redações concluídas
            </h2>
            <ul className="space-y-2">
              {concluidas.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/match/${m.id}/result`}
                    className="block rounded-lg border border-zinc-800 p-4 transition hover:border-zinc-700 hover:bg-zinc-900/60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-200">
                          {m.temaTitulo}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-600">
                          <span>
                            {new Date(m.criadaEm).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                          <span>{m.minutosGastos} min</span>
                          <span>{m.origem === "typed" ? "digitada" : "à mão"}</span>
                          {m.dicasAbertas > 0 && (
                            <span className="text-amber-600">
                              {m.dicasAbertas} dica{m.dicasAbertas === 1 ? "" : "s"}
                            </span>
                          )}
                          {m.livre && <span className="text-zinc-400">treino livre</span>}
                          {m.isReplay && <span className="text-amber-600">repetição</span>}
                          {m.expirada && <span className="text-red-500">expirada</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-lg font-bold text-zinc-100">
                          {m.notaBruta}
                        </p>
                        <p
                          className={`font-mono text-xs ${
                            m.livre || m.expirada ? "text-zinc-600" : "text-emerald-400"
                          }`}
                        >
                          {m.livre ? "sem XP" : `${m.xpFinal} XP`}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Card({
  rotulo,
  valor,
  sufixo,
}: {
  rotulo: string;
  valor: string | number;
  sufixo?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500">{rotulo}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
        {valor}
        {sufixo && <span className="ml-1 text-xs font-normal text-zinc-500">{sufixo}</span>}
      </p>
    </div>
  );
}

/**
 * Linha da nota bruta ao longo das partidas.
 *
 * SVG inline. Uma biblioteca de gráficos para desenhar uma polyline seria
 * ~50 kB no bundle para substituir 20 linhas de código.
 */
function Grafico({ partidas }: { partidas: PartidaConcluida[] }) {
  const L = 60, R = 10, T = 12, B = 22;
  const W = 640, H = 200;
  const areaW = W - L - R;
  const areaH = H - T - B;

  const n = partidas.length;
  const x = (i: number) => L + (n === 1 ? areaW / 2 : (i / (n - 1)) * areaW);
  const y = (v: number) => T + areaH - (v / 1000) * areaH;

  const pontos = partidas.map((p, i) => `${x(i)},${y(p.notaBruta)}`).join(" ");

  return (
    <div className="overflow-x-auto rounded-lg bg-zinc-900 p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img"
           aria-label={`Nota das ${n} redações, da primeira à última`}>
        {[0, 250, 500, 750, 1000].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#27272a" strokeWidth="1" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#52525b">
              {v}
            </text>
          </g>
        ))}

        <polyline
          points={pontos}
          fill="none"
          stroke="#34d399"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {partidas.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.notaBruta)} r="4"
                  fill={p.expirada ? "#71717a" : "#34d399"} />
        ))}

        <text x={L} y={H - 6} fontSize="11" fill="#52525b">1ª</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" fill="#52525b">
          {n}ª
        </text>
      </svg>
    </div>
  );
}
