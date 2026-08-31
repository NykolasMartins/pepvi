"use client";

import { useState } from "react";
import SeletorDificuldade from "./SeletorDificuldade";
import TreinoLivre from "./TreinoLivre";
import type { Dificuldade, TemaDaLista } from "./actions";

/**
 * As duas portas de entrada do jogo, lado a lado.
 *
 * Abas e não uma tela separada: a escolha "vale XP ou é treino" acontece no
 * mesmo momento em que se escolhe a dificuldade, e esconder o treino livre
 * atrás de um link faria dele um modo que ninguém acha.
 */
export default function ModoDeJogo({
  dificuldades,
  xpTotal,
  temas,
}: {
  dificuldades: Dificuldade[];
  xpTotal: number;
  temas: TemaDaLista[];
}) {
  const [modo, setModo] = useState<"valendo" | "livre">("valendo");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Modo de jogo" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {(
          [
            ["valendo", "Valendo XP"],
            ["livre", "Treino livre"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={modo === value}
            onClick={() => setModo(value)}
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition ${
              modo === value
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {modo === "valendo" ? (
        <SeletorDificuldade dificuldades={dificuldades} xpTotal={xpTotal} />
      ) : (
        <TreinoLivre temas={temas} />
      )}
    </div>
  );
}
