import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Countdown from "./Countdown";
import Pausa from "./Pausa";
import SubmitPanel from "./SubmitPanel";
import Grading from "./Grading";
import Hints from "./Hints";
import { supabaseUser, unwrap } from "@/lib/supabase";
import { effectiveStatus, type MatchStatus } from "@/lib/matchStatus";
import { listHints } from "@/app/actions";

export const dynamic = "force-dynamic";

// 60 s é o teto do plano gratuito da Vercel — e a correção foi dividida em
// duas requisições (transcrição, depois avaliação) justamente para caber nele.
// Em servidor persistente (Render) este valor é ignorado.
export const maxDuration = 60;

type SupportingText = { source?: string; content?: string };

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseUser();

  const match = unwrap(
    await supabase
      .from("matches")
      .select(
        "id, status, started_at, submitted_at, duration_seconds, deadline, paused_at, anti_replay_code, is_replay, is_free, duel_id, themes(title, statement, supporting_texts, created_by)"
      )
      .eq("id", id)
      .maybeSingle()
  );

  if (!match) notFound();

  // Derivado na leitura: partida vencida vira expired e correção travada há
  // mais de 15 min vira grading_failed. Sem cron, sem view.
  const status = effectiveStatus({
    status: match.status as MatchStatus,
    deadline: match.deadline,
    submitted_at: match.submitted_at,
    // Sem isto, uma partida pausada além do prazo original seria exibida como
    // expirada — o deadline dela está congelado, mas now() não para.
    paused_at: match.paused_at,
  });

  if (status === "graded") redirect(`/match/${id}/result`);

  const theme = match.themes as unknown as {
    title: string;
    statement: string;
    supporting_texts: SupportingText[];
    created_by: string | null;
  };
  // created_by não-null = tema escrito pelo próprio jogador no treino livre.
  const temaProprio = Boolean(theme.created_by);

  // serverNow sai do mesmo servidor que gerou o deadline: é isso que permite
  // ao cliente corrigir o desvio do próprio relógio.
  const serverNow = new Date().toISOString();
  const pausado = Boolean(match.paused_at);
  const timeUp = !pausado && new Date(match.deadline).getTime() <= Date.now();

  // Metadados sempre; conteúdo só das já abertas. Quem decide isso é a função
  // no Postgres, não este componente.
  //
  // Treino livre não tem dicas: lá o tema é escolhido e não há XP para pagar
  // por elas, então liberá-las seria entregar o repertório de qualquer tema de
  // graça. abrir_dica() recusa de qualquer forma — isto só evita desenhar um
  // botão que vai dar erro.
  const hints =
    status === "in_progress" && !match.is_free ? await listHints(id) : [];

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="sticky top-0 z-40 -mx-5 mb-8 border-b border-borda/60 bg-fundo/95 px-5 py-4 backdrop-blur">
        <Countdown
          deadline={match.deadline}
          serverNow={serverNow}
          pausedAt={match.paused_at}
        />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>
            Código da folha:{" "}
            <strong className="font-mono text-zinc-300">
              {match.anti_replay_code}
            </strong>
          </span>
          <span>·</span>
          <span>{Math.round(match.duration_seconds / 60)} min</span>
          {match.is_free && (
            <>
              <span>·</span>
              <span className="text-zinc-400">treino livre · sem XP</span>
            </>
          )}
          {pausado && (
            <>
              <span>·</span>
              <span className="text-amber-400">pausado</span>
            </>
          )}
          {match.is_replay && (
            <>
              <span>·</span>
              <span className="text-amber-400">repetição · XP × 0,5</span>
            </>
          )}
        </div>
      </header>

      <article className="space-y-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-500">
            {/* O jogador precisa saber que está num duelo: o tempo e a nota
                daqui vão para a comparação com o adversário. */}
            {match.duel_id && (
              <span className="rounded-full bg-amber-950 px-2.5 py-0.5 text-amber-400">
                ⚔ duelo
              </span>
            )}
            {temaProprio ? "Seu tema" : match.is_free ? "Tema escolhido" : "Tema sorteado"}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-snug">{theme.title}</h1>
        </div>

        <p className="rounded-lg bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-300">
          {theme.statement}
        </p>

        {temaProprio && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs leading-relaxed text-zinc-500">
            Tema escrito por você, então não há textos motivadores — todo o
            repertório da Competência 2 terá de ser seu.
          </p>
        )}

        {theme.supporting_texts?.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Textos motivadores
            </h2>
            {theme.supporting_texts.map((t, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-zinc-700 pl-4 text-sm leading-relaxed text-zinc-400"
              >
                {t.content}
                {t.source && (
                  <footer className="mt-1 text-xs text-zinc-600">— {t.source}</footer>
                )}
              </blockquote>
            ))}
          </section>
        )}

        {/* Só no treino livre. Valendo XP, parar o relógio é inflar o bônus de
            velocidade — e a recusa também está em pausar_partida(). */}
        {status === "in_progress" && match.is_free && (
          <Pausa matchId={match.id} pausado={pausado} />
        )}

        {status === "in_progress" && hints.length > 0 && <Hints hints={hints} />}

        {status === "in_progress" && (
          <SubmitPanel
            matchId={match.id}
            antiReplayCode={match.anti_replay_code}
            expired={timeUp}
          />
        )}

        {status === "grading" && <Grading matchId={match.id} kickOff />}

        {status === "needs_reupload" && (
          <>
            <div className="rounded-lg bg-amber-950/40 p-4 text-sm text-amber-200">
              <strong>Não conseguimos ler a foto.</strong>
              <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
                Isto <strong>não</strong> consumiu sua partida e o cronômetro já
                está parado — o tempo que você gastou está registrado. Fotografe
                de novo com mais luz, a folha reta e o enquadramento cobrindo
                todas as linhas.
              </p>
            </div>
            <SubmitPanel
              matchId={match.id}
              antiReplayCode={match.anti_replay_code}
              expired={timeUp}
            />
          </>
        )}

        {status === "grading_failed" && (
          <div className="space-y-3 rounded-lg bg-red-950/40 p-4 text-sm text-red-200">
            <strong>A correção falhou.</strong>
            <p className="text-xs leading-relaxed text-red-300/80">
              Suas fotos estão salvas e o tempo registrado. Nada foi perdido.
            </p>
            <Grading matchId={match.id} kickOff />
          </div>
        )}

        {status === "expired" && (
          <p className="rounded-lg bg-red-950/50 p-4 text-center text-sm text-red-300">
            Esta partida expirou. Ela é corrigida para você receber o feedback
            {match.is_free ? "." : ", mas não paga XP."}
          </p>
        )}

        <Link
          href="/"
          className="block text-center text-xs text-zinc-600 underline hover:text-zinc-400"
        >
          voltar ao lobby
        </Link>
      </article>
    </main>
  );
}
