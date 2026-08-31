"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { startFreeMatch, type TemaDaLista } from "./actions";
import {
  TREINO_LIVRE_MIN_MINUTOS,
  TREINO_LIVRE_MAX_MINUTOS,
  TEMA_LIVRE_MIN_CHARS,
  TEMA_LIVRE_MAX_CHARS,
} from "@/lib/treinoLivre";

/** Atalhos para os tempos que as pessoas realmente usam. */
const PRESETS = [30, 60, 90, 120];

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-zinc-200 px-8 py-5 text-lg font-bold tracking-wide text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "ABRINDO…" : "COMEÇAR TREINO"}
    </button>
  );
}

/**
 * Treino livre: o jogador ESCREVE o tema que quer treinar, escolhe o relógio, e
 * a partida não pontua.
 *
 * O campo de texto é o caminho principal — é para isso que o modo existe. O
 * catálogo continua ali atrás porque quem não tem um tema em mente ainda
 * precisa de um, e a lista já estava pronta.
 *
 * Os controles são nativos: <textarea>, <select>, <input type="number">. Um
 * combobox próprio custaria busca, teclado e acessibilidade para resolver o que
 * o navegador já resolve, inclusive no celular.
 */
export default function TreinoLivre({ temas }: { temas: TemaDaLista[] }) {
  const [origem, setOrigem] = useState<"escrever" | "catalogo">("escrever");
  const [tema, setTema] = useState("");
  const [temaId, setTemaId] = useState("");   // "" = aleatório
  const [minutos, setMinutos] = useState(90);

  const escrevendo = origem === "escrever";
  const limpo = tema.trim();

  // Clamp de cortesia: quem decide é iniciar_partida, no Postgres. Isto só
  // evita a viagem até o servidor para receber um erro previsível.
  const temaOk =
    !escrevendo ||
    (limpo.length >= TEMA_LIVRE_MIN_CHARS && limpo.length <= TEMA_LIVRE_MAX_CHARS);
  const tempoOk =
    Number.isInteger(minutos) &&
    minutos >= TREINO_LIVRE_MIN_MINUTOS &&
    minutos <= TREINO_LIVRE_MAX_MINUTOS;

  const jogados = temas.filter((t) => t.jogado).length;

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-400">
        <strong className="text-zinc-200">Não vale XP.</strong> Você escreve o
        tema e escolhe o tempo, então não há o que comparar — e por isso também
        não entra no ranking nem queima o tema da roleta. Sem dicas, pelo mesmo
        motivo. Em troca,{" "}
        <strong className="text-zinc-200">o relógio pode ser pausado</strong>. A
        correção é a mesma: cinco competências, mesma rubrica.
      </p>

      <div role="tablist" aria-label="De onde vem o tema" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {(
          [
            ["escrever", "Escrever o tema"],
            ["catalogo", "Usar o catálogo"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={origem === value}
            onClick={() => setOrigem(value)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition ${
              origem === value
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {escrevendo ? (
        <label className="block">
          <span className="text-xs text-zinc-500">Tema da redação</span>
          <textarea
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            rows={3}
            maxLength={TEMA_LIVRE_MAX_CHARS}
            placeholder="Ex.: Os desafios da preservação da memória indígena no Brasil"
            className="mt-1 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-relaxed outline-none focus:border-zinc-600"
          />
          <span className="mt-1 flex justify-between text-xs text-zinc-600">
            <span>
              Escreva só o tema — a proposta no formato do ENEM é montada em
              volta dele.
            </span>
            <span
              className={`tabular shrink-0 pl-3 font-mono ${
                limpo.length > 0 && limpo.length < TEMA_LIVRE_MIN_CHARS
                  ? "text-amber-500"
                  : ""
              }`}
            >
              {limpo.length}/{TEMA_LIVRE_MAX_CHARS}
            </span>
          </span>
        </label>
      ) : (
        <label className="block">
          <span className="text-xs text-zinc-500">Tema</span>
          <select
            value={temaId}
            onChange={(e) => setTemaId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-600"
          >
            <option value="">Aleatório (qualquer um, inclusive repetido)</option>
            {temas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.jogado ? "✓ " : ""}
                {t.title}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-zinc-600">
            {temas.length} tema{temas.length === 1 ? "" : "s"} com textos
            motivadores
            {jogados > 0 && ` · ✓ marca os ${jogados} que você já fez`}
          </span>
        </label>
      )}

      <div>
        <span className="text-xs text-zinc-500">Tempo</span>
        <div className="mt-1 flex gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutos(m)}
              className={`flex-1 rounded-lg border px-2 py-2 font-mono text-xs transition ${
                minutos === m
                  ? "border-zinc-400 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
              }`}
            >
              {m} min
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-3">
          <input
            type="number"
            min={TREINO_LIVRE_MIN_MINUTOS}
            max={TREINO_LIVRE_MAX_MINUTOS}
            value={minutos}
            onChange={(e) => setMinutos(e.target.valueAsNumber)}
            className="w-24 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-center font-mono text-sm outline-none focus:border-zinc-600"
          />
          <span className="text-xs text-zinc-600">
            minutos ({TREINO_LIVRE_MIN_MINUTOS} a {TREINO_LIVRE_MAX_MINUTOS})
          </span>
        </label>
      </div>

      <form
        action={startFreeMatch.bind(
          null,
          escrevendo ? limpo : null,
          escrevendo ? null : temaId || null,
          minutos
        )}
      >
        <fieldset disabled={!temaOk || !tempoOk} className="disabled:opacity-50">
          <Botao />
        </fieldset>
      </form>

      <p className="text-center text-xs leading-relaxed text-zinc-600">
        Tema escrito por você não tem textos motivadores — todo o repertório terá
        de ser seu. Dá para pausar a qualquer momento; uma pausa esquecida por
        mais de 24 h encerra a partida.
      </p>
    </div>
  );
}
