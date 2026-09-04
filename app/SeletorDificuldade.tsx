"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { startMatch, type Dificuldade } from "./actions";

function Botao({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-emerald-500 px-8 py-5 text-lg font-bold tracking-wide text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "SORTEANDO…" : label}
    </button>
  );
}

/**
 * Escolha da dificuldade.
 *
 * O cadeado aqui é informativo. Quem valida o desbloqueio é iniciar_partida(),
 * no Postgres — desabilitar um botão não impede ninguém de mandar o POST.
 */
export default function SeletorDificuldade({
  dificuldades,
  xpTotal,
  semCota = false,
}: {
  dificuldades: Dificuldade[];
  xpTotal: number;
  semCota?: boolean;
}) {
  const liberadas = dificuldades.filter((d) => d.desbloqueada);
  const [escolhida, setEscolhida] = useState(
    liberadas[liberadas.length - 1]?.id ?? "padrao"
  );

  const atual = dificuldades.find((d) => d.id === escolhida);

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {dificuldades.map((d) => {
          const ativa = d.id === escolhida;
          const falta = d.min_xp - xpTotal;
          return (
            <button
              key={d.id}
              type="button"
              disabled={!d.desbloqueada}
              onClick={() => setEscolhida(d.id)}
              className={`rounded-lg border p-3 text-left transition ${
                !d.desbloqueada
                  ? "cursor-not-allowed border-zinc-900 opacity-50"
                  : ativa
                    ? "border-emerald-500 bg-emerald-950/30"
                    : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-sm font-semibold ${ativa ? "text-emerald-300" : "text-zinc-200"}`}>
                  {d.desbloqueada ? "" : "🔒 "}
                  {d.label}
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-500">
                  {Math.round(d.duration_seconds / 60)} min
                  {Number(d.xp_multiplier) !== 1 && (
                    <span className="ml-2 text-emerald-500">
                      XP × {Number(d.xp_multiplier).toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {d.desbloqueada
                  ? d.descricao
                  : `Desbloqueia com ${d.min_xp.toLocaleString("pt-BR")} XP — faltam ${falta.toLocaleString("pt-BR")}.`}
              </p>
            </button>
          );
        })}
      </div>

      <form action={startMatch.bind(null, escolhida)}>
        <fieldset disabled={semCota} className="disabled:opacity-50">
        <Botao
          label={
            atual && atual.id !== "padrao"
              ? `GIRAR ROLETA · ${atual.label.toUpperCase()}`
              : "GIRAR ROLETA DE TEMAS"
          }
        />
        </fieldset>
      </form>
    </div>
  );
}
