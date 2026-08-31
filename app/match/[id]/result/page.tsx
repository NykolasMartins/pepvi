import { notFound } from "next/navigation";
import Link from "next/link";
import Transcript from "./Transcript";
import { supabaseUser, unwrap } from "@/lib/supabase";
import type { C1Signals, C2Signals, C3Signals, C5Flags, Competency } from "@/lib/enem";

export const dynamic = "force-dynamic";

const COMPETENCIAS = [
  "Domínio da norma culta",
  "Compreensão da proposta e repertório",
  "Seleção e organização de argumentos",
  "Mecanismos linguísticos de coesão",
  "Proposta de intervenção",
];

const C5_ELEMENTOS: { key: keyof C5Flags; label: string }[] = [
  { key: "hasAgent", label: "Agente" },
  { key: "hasAction", label: "Ação" },
  { key: "hasMeans", label: "Meio / modo" },
  { key: "hasPurpose", label: "Finalidade" },
  { key: "hasDetailing", label: "Detalhamento" },
];

// Separados dos cinco elementos: não somam pontos, definem o teto.
const C5_QUALIDADE: { key: keyof C5Flags; label: string }[] = [
  { key: "agentIsSpecific", label: "agente nomeado" },
  { key: "actionIsDetailed", label: "ação detalhada" },
];

type Feedback = {
  competencies?: Competency[];
  c1?: C1Signals;
  c2?: C2Signals;
  c3?: C3Signals;
  c5?: C5Flags;
  /** Motivo de cada teto aplicado em código, por competência. */
  ceilings?: { c1?: string; c2?: string; c3?: string; c5?: string };
  escapesTheme?: boolean;
  isDisconnected?: boolean;
  zeroed?: boolean;
  generalFeedback?: string;
  topPriority?: string;
  illegibleCount?: number;
  antiReplayCodeFound?: boolean;
};

function barColor(score: number) {
  if (score >= 160) return "bg-emerald-500";
  if (score >= 120) return "bg-lime-500";
  if (score >= 80) return "bg-amber-500";
  return "bg-red-500";
}

export default async function ResultPage({
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
      "id, status, elapsed_seconds, duration_seconds, raw_score, hint_penalty, speed_bonus, xp_final, scoring_version, is_replay, is_free, flagged, themes(title)"
    )
      .eq("id", id)
      .maybeSingle()
  );

  if (!match) notFound();

  const [{ data: correction }, { data: submission }, { count: dicasAbertas }] =
    await Promise.all([
    supabase
      .from("corrections")
      .select("c1, c2, c3, c4, c5, raw_score, feedback, rubric_version, model, tokens_in, tokens_out, attempt")
      .eq("match_id", id)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("submissions")
      .select("transcript, legibility, disputed")
      .eq("match_id", id)
      .maybeSingle(),
    supabase
      .from("match_hints")
      .select("cost_xp", { count: "exact" })
      .eq("match_id", id),
  ]);

  const theme = match.themes as unknown as { title: string };
  const expired = match.status === "expired";
  const livre = match.is_free as boolean;

  if (!correction) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-zinc-400">
          Esta partida ainda não foi corrigida. Status:{" "}
          <strong className="text-zinc-200">{match.status}</strong>
        </p>
        <Link href={`/match/${id}`} className="mt-6 inline-block text-sm text-emerald-400 underline">
          voltar para a partida
        </Link>
      </main>
    );
  }

  const fb = (correction.feedback ?? {}) as Feedback;
  const scores = [correction.c1, correction.c2, correction.c3, correction.c4, correction.c5];
  const elapsed = match.elapsed_seconds ?? 0;
  const savedSeconds = Math.max(0, match.duration_seconds - elapsed);

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-5 py-10">
      {/* No treino livre o número grande é a NOTA. Mostrar "0 XP" em letra
          garrafal seria anunciar um fracasso onde não houve tentativa de
          pontuar — e a nota é o que o modo existe para entregar. */}
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {livre ? "Treino livre" : expired ? "Partida expirada" : "Partida concluída"}
        </p>
        <div
          className={`tabular mt-3 font-display text-7xl font-extrabold ${
            !livre && expired ? "text-zinc-600" : "text-emerald-400"
          }`}
        >
          {livre ? (correction.raw_score ?? 0) : (match.xp_final ?? 0)}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {livre ? "nota de 0 a 1000" : "XP ganho"}
        </p>
        <h1 className="mt-6 text-sm text-zinc-400">{theme.title}</h1>
      </header>

      {fb.zeroed && (
        <p className="rounded-lg bg-red-950/50 p-4 text-sm text-red-200">
          <strong>
            {fb.escapesTheme ? "Fuga ao tema." : "Texto não dissertativo-argumentativo."}
          </strong>{" "}
          Pela regra do ENEM, isso zera a redação inteira — independentemente da
          qualidade da escrita.
        </p>
      )}

      {fb.topPriority && (
        <section className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-500">
            Treine isto na próxima
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/90">
            {fb.topPriority}
          </p>
        </section>
      )}

      {livre && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs leading-relaxed text-zinc-400">
          <strong className="text-zinc-200">Treino livre.</strong> Você escolheu
          o tema e o tempo, então esta partida não paga XP nem entra no ranking
          — e o tema continua disponível para a roleta. A correção abaixo é a
          mesma das partidas valendo.
        </p>
      )}

      {/* Composição do XP: é a decomposição que ensina o jogador a jogar
          melhor. Um número único não ensina nada. */}
      {!livre && (
      <section className="space-y-1 rounded-lg bg-zinc-900 p-5 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Como esse XP foi formado
        </h2>
        <Row label="Nota das 5 competências" value={`+${match.raw_score ?? 0}`} />
        <Row
          label={
            dicasAbertas
              ? `Penalidade por ${dicasAbertas} dica${dicasAbertas === 1 ? "" : "s"}`
              : "Penalidade por dicas"
          }
          value={match.hint_penalty ? `−${match.hint_penalty}` : "0"}
          muted={!match.hint_penalty}
        />
        <Row
          label={`Bônus de velocidade (sobraram ${Math.floor(savedSeconds / 60)} min)`}
          value={match.speed_bonus ? `+${match.speed_bonus}` : "0"}
          muted={!match.speed_bonus}
        />
        {match.is_replay && <Row label="Tema repetido" value="× 0,5" />}
        {expired && <Row label="Enviada após o prazo" value="XP zerado" />}
        <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 font-bold">
          <span>XP final</span>
          <span>{match.xp_final ?? 0}</span>
        </div>
      </section>
      )}

      <section className="space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Competências — {correction.raw_score} / 1000
        </h2>

        {COMPETENCIAS.map((nome, i) => {
          const detail = fb.competencies?.find((c) => c.id === i + 1);
          return (
            <div key={i} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300">
                  <span className="text-zinc-600">C{i + 1}</span> {nome}
                </span>
                <span className="font-mono font-semibold">{scores[i]}</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${barColor(scores[i])}`}
                  style={{ width: `${(scores[i] / 200) * 100}%` }}
                />
              </div>

              {(() => {
                const motivo =
                  i === 0 ? fb.ceilings?.c1
                  : i === 1 ? fb.ceilings?.c2
                  : i === 2 ? fb.ceilings?.c3
                  : i === 4 ? fb.ceilings?.c5
                  : undefined;
                return motivo ? (
                  <p className="rounded-md bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-300/90">
                    <strong>Nota limitada:</strong> {motivo}.
                  </p>
                ) : null;
              })()}

              {i === 1 && fb.c2?.sourceNote && (
                <p className="text-xs leading-relaxed text-zinc-500">
                  <span className="text-zinc-600">Origem do repertório:</span>{" "}
                  {fb.c2.sourceNote}
                </p>
              )}

              {detail?.justification && (
                <p className="text-xs leading-relaxed text-zinc-400">
                  {detail.justification}
                </p>
              )}

              {detail?.evidence && detail.evidence.length > 0 && (
                <ul className="space-y-1">
                  {detail.evidence.map((ev, j) => (
                    <li
                      key={j}
                      className="border-l-2 border-zinc-700 pl-3 text-xs italic leading-relaxed text-zinc-500"
                    >
                      &ldquo;{ev}&rdquo;
                    </li>
                  ))}
                </ul>
              )}

              {/* C5 é contada em código a partir dos 5 elementos — por isso o
                  feedback pode ser "faltou detalhamento" em vez de um número. */}
              {i === 4 && fb.c5 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {C5_ELEMENTOS.map(({ key, label }) => {
                      const ok = Boolean(fb.c5?.[key]);
                      return (
                        <span
                          key={key}
                          className={`rounded-full px-3 py-1 text-xs ${
                            ok
                              ? "bg-emerald-950 text-emerald-300"
                              : "bg-zinc-800 text-zinc-500 line-through"
                          }`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {C5_QUALIDADE.map(({ key, label }) => {
                      const ok = Boolean(fb.c5?.[key]);
                      return (
                        <span
                          key={key}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            ok
                              ? "border-emerald-900 text-emerald-400"
                              : "border-zinc-700 text-zinc-500"
                          }`}
                        >
                          {ok ? "✓" : "✗"} {label}
                        </span>
                      );
                    })}
                  </div>

                  {fb.c5.violatesHumanRights && (
                    <p className="text-xs text-red-400">
                      Proposta que fere os direitos humanos zera a competência 5.
                    </p>
                  )}
                  {fb.c5.justification && (
                    <p className="text-xs leading-relaxed text-zinc-400">
                      {fb.c5.justification}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>

      {fb.generalFeedback && (
        <section className="rounded-lg bg-zinc-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Comentário geral
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {fb.generalFeedback}
          </p>
        </section>
      )}

      <Transcript
        matchId={id}
        text={submission?.transcript ?? null}
        legibility={submission?.legibility ?? null}
        disputed={Boolean(submission?.disputed)}
      />

      {match.flagged && (
        <p className="rounded-lg bg-amber-950/30 p-4 text-xs leading-relaxed text-amber-300/80">
          Não encontramos o código da partida escrito na folha. Isso não afeta
          sua nota — mas anote o código na próxima, é o que garante que a
          redação foi escrita nesta partida.
        </p>
      )}

      <footer className="space-y-3 border-t border-zinc-900 pt-6 text-center">
        <div className="flex justify-center gap-6 text-sm">
          <Link href="/" className="text-emerald-400 underline">
            nova partida
          </Link>
          <span className="text-zinc-700">·</span>
          <Link href="/progresso" className="text-zinc-400 underline">
            ver progresso
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-zinc-600">
          {Math.floor(elapsed / 60)} min gastos · rubrica{" "}
          <code>{correction.rubric_version}</code> · scoring{" "}
          <code>{match.scoring_version}</code> · tentativa {correction.attempt} ·{" "}
          {(correction.tokens_in ?? 0) + (correction.tokens_out ?? 0)} tokens
          {typeof fb.illegibleCount === "number" && fb.illegibleCount > 0 && (
            <> · {fb.illegibleCount} trecho(s) ilegível(is)</>
          )}
        </p>
      </footer>
    </main>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${muted ? "text-zinc-600" : "text-zinc-300"}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
