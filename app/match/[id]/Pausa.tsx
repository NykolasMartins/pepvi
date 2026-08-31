"use client";

import { useFormStatus } from "react-dom";
import { pauseMatch, resumeMatch } from "@/app/actions";

/**
 * Pausar e retomar o treino livre.
 *
 * Um <form> com Server Action, não fetch: quem empurra o deadline é o Postgres,
 * e a página precisa ser re-renderizada com o prazo novo. A revalidação já vem
 * de graça na volta da ação.
 */
function Botao({ pausado }: { pausado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full rounded-xl px-6 py-4 text-sm font-bold tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${
        pausado
          ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
      }`}
    >
      {pending ? "…" : pausado ? "▶ RETOMAR" : "⏸ PAUSAR"}
    </button>
  );
}

export default function Pausa({
  matchId,
  pausado,
}: {
  matchId: string;
  pausado: boolean;
}) {
  const acao = pausado ? resumeMatch : pauseMatch;

  return (
    <div className="space-y-2">
      {/* bind, e não useActionState com função variável: o hook guardaria a
          função do render em que criou o formAction, e trocar de estado mudaria
          o rótulo do botão sem trocar a ação enviada. Já custou um login que
          mandava cadastro. */}
      <form action={acao.bind(null, matchId)}>
        <Botao pausado={pausado} />
      </form>
      {pausado && (
        <p className="text-center text-xs leading-relaxed text-zinc-600">
          Pausa esquecida por mais de 24 horas encerra a partida — senão ela
          ficaria ocupando sua única vaga de partida ativa para sempre.
        </p>
      )}
    </div>
  );
}
