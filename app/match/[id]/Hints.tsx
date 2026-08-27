"use client";

import { useState } from "react";
import { openHint, type Hint } from "@/app/actions";

const ROTULO: Record<Hint["kind"], string> = {
  repertorio: "Repertório sociocultural",
  tese: "Ângulo de tese",
  estrutura: "Estrutura",
};

/**
 * Dicas com penalidade.
 *
 * O conteúdo NÃO vem no payload inicial: cada item chega com `content: null`
 * até ser aberto. O erro clássico aqui é mandar tudo junto e esconder com CSS —
 * o DevTools entrega de graça e a penalidade vira enfeite.
 *
 * A confirmação antes de abrir é deliberada: gastar XP sem querer, num jogo
 * cuja unidade de valor é a partida, é o tipo de arrepender que estraga a
 * sessão inteira.
 */
export default function Hints({ hints: iniciais }: { hints: Hint[] }) {
  const [hints, setHints] = useState(iniciais);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (hints.length === 0) return null;

  const abertas = hints.filter((h) => h.opened);
  const penalidade = abertas.reduce((s, h) => s + h.cost_xp, 0);

  async function abrir(id: string) {
    setErro(null);
    setConfirmando(null);
    setAbrindo(id);
    try {
      const content = await openHint(id);
      setHints((atual) =>
        atual.map((h) => (h.id === id ? { ...h, opened: true, content } : h))
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Dicas</h2>
        <span
          className={`text-xs ${penalidade > 0 ? "text-amber-400" : "text-zinc-500"}`}
        >
          {penalidade > 0
            ? `−${penalidade} XP acumulados em penalidade`
            : "nenhuma aberta"}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        Cada dica aberta desconta XP do resultado desta partida. O desconto
        aparece decomposto na tela final.
      </p>

      {erro && (
        <p className="rounded-md bg-amber-950/50 p-3 text-xs text-amber-300">{erro}</p>
      )}

      <ul className="space-y-2">
        {hints.map((h) => (
          <li
            key={h.id}
            className={`rounded-lg border p-4 ${
              h.opened
                ? "border-zinc-800 bg-zinc-900"
                : "border-zinc-800/60 border-dashed"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-zinc-400">
                {ROTULO[h.kind]}
              </span>

              {h.opened ? (
                <span className="text-xs text-amber-500">−{h.cost_xp} XP</span>
              ) : confirmando === h.id ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => abrir(h.id)}
                    disabled={abrindo !== null}
                    className="rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {abrindo === h.id ? "abrindo…" : `custar ${h.cost_xp} XP`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    cancelar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(h.id)}
                  className="rounded-md bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  abrir · −{h.cost_xp} XP
                </button>
              )}
            </div>

            {h.opened && h.content && (
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {h.content}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
