"use client";

import { useState } from "react";
import UploadForm from "./UploadForm";
import TypedForm from "./TypedForm";

type Mode = "handwritten" | "typed";

/**
 * Escolha do modo de entrega.
 *
 * Manuscrito continua sendo o padrão porque é o que o ENEM cobra — escrever à
 * mão em 90 minutos treina uma habilidade que digitar não treina. Digitado
 * existe para quem não tem câmera decente à mão ou só quer treinar
 * argumentação.
 */
export default function SubmitPanel({
  matchId,
  antiReplayCode,
  expired,
}: {
  matchId: string;
  antiReplayCode: string;
  expired: boolean;
}) {
  const [mode, setMode] = useState<Mode>("handwritten");

  return (
    <section className="space-y-5 rounded-lg border border-zinc-800 p-6">
      <div>
        <h2 className="text-sm font-semibold">Enviar a redação</h2>
        <p className="mt-1 text-xs text-zinc-500">
          O cronômetro só para quando você apertar enviar.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Modo de entrega"
        className="flex gap-1 rounded-lg bg-zinc-900 p-1"
      >
        {(
          [
            ["handwritten", "À mão (foto)"],
            ["typed", "Digitar"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`flex-1 rounded-md px-4 py-3 text-sm font-medium transition ${
              mode === value
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "handwritten" ? (
        <>
          <p className="rounded-md bg-zinc-900 p-3 text-center text-xs leading-relaxed text-zinc-500">
            Anote o código{" "}
            <strong className="font-mono text-zinc-300">{antiReplayCode}</strong>{" "}
            no canto da folha antes de fotografar.
          </p>
          <UploadForm matchId={matchId} />
        </>
      ) : (
        <TypedForm matchId={matchId} />
      )}

      {expired && (
        <p className="text-xs text-red-400">
          O prazo já passou. Você ainda pode enviar para receber a correção, mas
          a partida não paga XP.
        </p>
      )}
    </section>
  );
}
