"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { disputeTranscript } from "@/app/actions";

/**
 * Transcrição em modo LEITURA.
 *
 * O usuário precisa ver o que a IA leu — senão nota baixa por erro de leitura
 * é indistinguível de nota baixa merecida, e a confiança morre na primeira
 * injustiça.
 *
 * Mas edição livre é o buraco perfeito: corrige-se a ortografia e a
 * Competência 1 sobe. Por isso só existe "a leitura saiu errada", que
 * reprocessa uma vez.
 */
export default function Transcript({
  matchId,
  text,
  legibility,
  disputed,
}: {
  matchId: string;
  text: string | null;
  legibility: number | null;
  disputed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!text) return null;

  async function onDispute() {
    setBusy(true);
    setError(null);
    try {
      await disputeTranscript(matchId);
      router.replace(`/match/${matchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          O que a IA leu na sua folha
        </h2>
        {legibility !== null && (
          <span className="text-xs text-zinc-600">
            legibilidade {legibility.toFixed(2)}
          </span>
        )}
      </div>

      <div
        className={`relative overflow-hidden rounded-lg bg-zinc-900 p-4 ${
          open ? "" : "max-h-40"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-400 select-text">
          {text}
        </p>
        {!open && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-900 to-transparent" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-zinc-400 underline hover:text-zinc-200"
        >
          {open ? "recolher" : "ver transcrição completa"}
        </button>

        {disputed ? (
          <span className="text-zinc-600">já reprocessada uma vez</span>
        ) : (
          <button
            type="button"
            onClick={onDispute}
            disabled={busy}
            className="text-amber-400 underline hover:text-amber-300 disabled:opacity-50"
          >
            {busy ? "reprocessando…" : "a leitura saiu errada"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <p className="text-xs leading-relaxed text-zinc-600">
        Não dá para editar este texto: liberar edição seria liberar corrigir a
        ortografia, e a Competência 1 avalia exatamente isso. Se a leitura
        estiver errada, reprocessamos a foto.
      </p>
    </section>
  );
}
