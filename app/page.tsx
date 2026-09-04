import Link from "next/link";
import { listDifficulties, listThemes, remainingEssays } from "./actions";
import ModoDeJogo from "./ModoDeJogo";
import { signOut } from "./auth-actions";
import { supabaseUser, requireUser } from "@/lib/supabase";
import { nivelDe } from "@/lib/levels";

export const dynamic = "force-dynamic";

export default async function Lobby() {
  const user = await requireUser();
  const supabase = await supabaseUser();

  // Sem filtro por user_id: a RLS já restringe a auth.uid(). Se algum dia esses
  // números vierem errados, é sinal de política frouxa — não de filtro esquecido.
  const [{ count: totalTemas }, { count: jogadas }, { count: queimados }, { data: profile }, { data: pontuadas }] =
    await Promise.all([
      supabase.from("themes").select("*", { count: "exact", head: true }).eq("active", true),
      supabase.from("matches").select("*", { count: "exact", head: true }).neq("status", "cancelled"),
      // Só o que a roleta consumiu: treino livre não queima tema, então contá-lo
      // aqui faria "temas inéditos" cair sem que nenhum saísse do sorteio.
      supabase.from("matches").select("theme_id", { count: "exact", head: true }).neq("status", "cancelled").eq("is_free", false),
      supabase.from("profiles").select("username, is_admin").maybeSingle(),
      // Mesmo recorte de xp_total() no Postgres. Treino livre grava zero, então
      // o filtro não muda a soma hoje — ele evita que as duas contas divirjam.
      supabase.from("matches").select("xp_final").not("xp_final", "is", null).eq("is_free", false),
    ]);

  // XP somado das partidas, não de um contador em profiles: contador
  // denormalizado é uma segunda verdade que dessincroniza no primeiro
  // reprocessamento de correção.
  const xpTotal = (pontuadas ?? []).reduce((s, m) => s + (m.xp_final ?? 0), 0);
  const nivel = nivelDe(xpTotal);
  const [dificuldades, temas, cota] = await Promise.all([
    listDifficulties(),
    listThemes(),
    remainingEssays(),
  ]);

  const ineditos = Math.max(0, (totalTemas ?? 0) - (queimados ?? 0));
  const primeiraVez = (jogadas ?? 0) === 0;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg flex-col justify-center gap-8 px-5 py-10">
      <header className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-5xl font-extrabold tracking-tight">
              PEPVI
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Redação do ENEM contra o relógio.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* Só no lobby, nunca no Nav: pôr no Nav obrigaria o RootLayout a
                consultar o banco em toda página do site para desenhar um link
                que quase ninguém usa. */}
            {profile?.is_admin && (
              <Link
                href="/admin"
                className="whitespace-nowrap text-xs text-emerald-500 underline hover:text-emerald-300"
              >
                admin
              </Link>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="whitespace-nowrap text-xs text-zinc-600 underline hover:text-zinc-400"
              >
                sair
              </button>
            </form>
          </div>
        </div>

        {/* Nível como identidade, não como número solto. */}
        <div className="rounded-2xl border border-borda/60 bg-superficie/50 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-zinc-500">
                {profile?.username ?? user.email}
              </p>
              <p className="font-display text-xl font-bold text-emerald-400">
                {nivel.atual.nome}
              </p>
            </div>
            <p className="tabular shrink-0 text-right font-mono text-sm text-zinc-400">
              {xpTotal.toLocaleString("pt-BR")}
              <span className="ml-1 text-xs text-zinc-600">XP</span>
            </p>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(nivel.fracao * 100)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-zinc-600">
            {nivel.proximo
              ? `faltam ${nivel.xpParaProximo!.toLocaleString("pt-BR")} XP para ${nivel.proximo.nome}`
              : "nível máximo"}
          </p>
        </div>
      </header>

      {primeiraVez ? (
        // Primeira visita: explicar a mecânica antes de pedir a decisão. Sem
        // isto, o usuário aperta um botão sem saber que o relógio já vai correr.
        <section className="space-y-3 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-5">
          <h2 className="font-display text-lg font-bold text-emerald-300">
            Como funciona
          </h2>
          <ol className="space-y-2 text-sm leading-relaxed text-zinc-300">
            <li>
              <strong className="text-zinc-100">1.</strong> Um tema é sorteado — e
              nunca se repete para você.
            </li>
            <li>
              <strong className="text-zinc-100">2.</strong> O cronômetro começa na
              hora e não pausa, nem se você fechar a aba.
            </li>
            <li>
              <strong className="text-zinc-100">3.</strong> Escreva à mão e envie a
              foto, ou digite direto.
            </li>
            <li>
              <strong className="text-zinc-100">4.</strong> A correção sai nas 5
              competências. Sobrou tempo, rende mais XP; usou dica, rende menos.
            </li>
          </ol>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-borda/60 bg-superficie/50 p-4">
            <p className="text-xs text-zinc-500">Temas inéditos</p>
            <p className="tabular mt-1 font-mono text-2xl font-bold">{ineditos}</p>
          </div>
          <div className="rounded-xl border border-borda/60 bg-superficie/50 p-4">
            <p className="text-xs text-zinc-500">Partidas</p>
            <p className="tabular mt-1 font-mono text-2xl font-bold">{jogadas ?? 0}</p>
          </div>
        </div>
      )}

      {/* A cota é do PROJETO, não do jogador: a correção usa uma cota de IA
          diária e compartilhada. Avisar antes evita o pior caso, que é
          descobrir o teto depois de escrever a redação. */}
      {cota.restantes <= 3 && (
        <p
          className={`rounded-lg border p-3 text-center text-xs leading-relaxed ${
            cota.restantes === 0
              ? "border-red-900/60 bg-red-950/30 text-red-300"
              : "border-amber-900/60 bg-amber-950/20 text-amber-300"
          }`}
        >
          {cota.restantes === 0 ? (
            <>
              <strong>Você atingiu o limite de correções por 24 horas.</strong>
              {cota.liberaEm &&
                ` A próxima vaga abre em ${new Date(cota.liberaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`}
            </>
          ) : (
            <>
              Resta{cota.restantes === 1 ? "" : "m"}{" "}
              <strong>
                {cota.restantes} correç{cota.restantes === 1 ? "ão" : "ões"}
              </strong>{" "}
              nas próximas 24 horas.
            </>
          )}
        </p>
      )}

      <ModoDeJogo
        dificuldades={dificuldades}
        xpTotal={xpTotal}
        temas={temas}
        semCota={cota.restantes === 0}
      />

      <p className="text-center text-xs leading-relaxed text-zinc-600">
        Valendo XP, o cronômetro começa no sorteio e não pausa: abandonar{" "}
        <strong className="text-zinc-500">queima o tema</strong>, ele não volta
        para a roleta. No treino livre nada disso conta.
      </p>
    </main>
  );
}
