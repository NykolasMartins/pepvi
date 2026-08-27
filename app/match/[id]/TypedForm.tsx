"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitTypedMatch } from "@/app/actions";

const MIN_CHARS = 200;
/** ENEM pede 7 a 30 linhas manuscritas — algo em torno de 120 palavras no piso. */
const MIN_WORDS = 120;
/** Colagem de bloco maior que isto de uma vez marca a partida para inspeção. */
const PASTE_FLAG_CHARS = 200;

export default function TypedForm({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState(false);

  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const curto = trimmed.length < MIN_CHARS;

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await submitTypedMatch(matchId, text, pasted);
      // Daqui em diante quem manda é o status no banco: a página re-renderiza
      // em "grading" e o Grading assume.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const colado = e.clipboardData.getData("text");
          if (colado.length > PASTE_FLAG_CHARS) setPasted(true);
        }}
        disabled={busy}
        rows={16}
        placeholder="Escreva sua redação aqui…"
        /* Corretor do navegador DESLIGADO, e isto não é preferência de estilo:
           a Competência 1 avalia domínio da norma culta. Se o Chrome, o iOS ou
           o Grammarly consertarem a ortografia enquanto o aluno digita, a C1
           dá nota cheia para todo mundo e a avaliação perde sentido. */
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-serif text-sm leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={words < MIN_WORDS ? "text-amber-500" : "text-zinc-500"}>
          {words} palavra{words === 1 ? "" : "s"} · {trimmed.length} caracteres
          {words < MIN_WORDS && words > 0 && ` · abaixo das ~${MIN_WORDS} de uma redação completa`}
        </span>
        {pasted && (
          <span className="text-amber-500">
            colagem detectada — a partida será marcada
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-amber-950/50 p-3 text-xs text-amber-300">{error}</p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || curto}
        className="w-full rounded-lg bg-emerald-500 px-6 py-3 font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Parando o cronômetro…" : "ENVIAR REDAÇÃO"}
      </button>

      <p className="text-xs leading-relaxed text-zinc-600">
        O corretor ortográfico do navegador está desligado de propósito: a
        Competência 1 avalia domínio da norma culta, e corretor ligado daria nota
        cheia a todo mundo.
      </p>
    </div>
  );
}
