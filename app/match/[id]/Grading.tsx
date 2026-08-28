"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gradeMatch, getMatchStatus } from "@/app/actions";

const POLL_MS = 3000;

/**
 * Espera a correção terminar.
 *
 * Dispara gradeMatch sem aguardar e observa o status pelo banco. A correção
 * real leva 30–60s: prender a UI numa única promessa desse tamanho significa
 * que qualquer timeout de rede vira "sumiu minha redação".
 *
 * A fonte de verdade do progresso é o status no banco, não o resultado da
 * chamada — se a aba cair no meio, reabrir a página retoma o acompanhamento.
 */
export default function Grading({
  matchId,
  kickOff,
}: {
  matchId: string;
  kickOff: boolean;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!kickOff || started.current) return;
    started.current = true;

    // Uma chamada por etapa: a correção foi dividida para caber no teto de
    // função serverless. Encadeia até chegar num estado terminal.
    (async () => {
      try {
        for (let etapa = 0; etapa < 4; etapa++) {
          const r = await gradeMatch(matchId);
          if (r !== "transcricao") break;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [matchId, kickOff]);

  useEffect(() => {
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000);

    const poll = setInterval(async () => {
      try {
        const { status } = await getMatchStatus(matchId);
        if (status === "graded" || status === "expired") {
          router.replace(`/match/${matchId}/result`);
        } else if (status === "needs_reupload" || status === "grading_failed") {
          router.refresh();
        }
      } catch {
        // Falha de rede no poll não é falha da correção. Tenta de novo.
      }
    }, POLL_MS);

    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [matchId, router]);

  const stage =
    elapsed < 20 ? "Lendo a caligrafia…" : "Avaliando as 5 competências…";

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 p-8 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
      <div>
        <p className="text-sm font-medium">{error ? "Falha na correção" : stage}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {error ?? `${elapsed}s — costuma levar de 30 a 60 segundos`}
        </p>
      </div>
      {error && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            started.current = false;
            router.refresh();
          }}
          className="rounded-md bg-zinc-800 px-4 py-2 text-xs font-medium hover:bg-zinc-700"
        >
          tentar de novo
        </button>
      )}
      <p className="text-xs text-zinc-600">
        Pode fechar esta aba: a correção continua e o resultado fica salvo.
      </p>
    </section>
  );
}
