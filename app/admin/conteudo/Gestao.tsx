"use client";

import { useState, useTransition } from "react";
import {
  setConfig,
  salvarTema,
  salvarDificuldade,
  type TemaAdmin,
} from "@/app/admin-actions";
import type { Dificuldade } from "@/app/actions";

/**
 * Formulários da gestão de conteúdo.
 *
 * useTransition e não useActionState: aqui são vários formulários pequenos e
 * independentes na mesma tela, e o que interessa é "salvou / deu erro" por
 * bloco. O erro vem da exceção que a função do Postgres levanta — a validação
 * que vale é a de lá, e repeti-la aqui criaria duas regras para divergir.
 */
function useSalvar() {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const salvar = (fn: () => Promise<unknown>) =>
    iniciar(async () => {
      setErro(null);
      setOk(false);
      try {
        await fn();
        setOk(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falhou");
      }
    });

  return { salvar, pendente, erro, ok };
}

function Aviso({ erro, ok }: { erro: string | null; ok: boolean }) {
  if (erro)
    return <p className="text-xs leading-relaxed text-red-400">{erro}</p>;
  if (ok) return <p className="text-xs text-emerald-400">salvo</p>;
  return null;
}

const campo =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600";
const botao =
  "rounded-lg bg-zinc-200 px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50";

// --------------------------------------------------------------------------

export function TetoDiario({ atual }: { atual: number }) {
  const [valor, setValor] = useState(atual);
  const { salvar, pendente, erro, ok } = useSalvar();

  return (
    <div className="space-y-2 rounded-xl border border-borda/60 bg-superficie/50 p-4">
      <p className="text-sm font-medium text-zinc-200">
        Redações por usuário em 24 horas
      </p>
      <p className="text-xs leading-relaxed text-zinc-500">
        Cada redação custa 1 ou 2 chamadas de IA, e a cota do Gemini é diária e
        compartilhada. Com um teto alto, dois usuários esgotam o dia de todos.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={500}
          value={valor}
          onChange={(e) => setValor(e.target.valueAsNumber)}
          className={`${campo} w-24 text-center font-mono`}
        />
        <button
          type="button"
          disabled={pendente || valor === atual || !Number.isInteger(valor)}
          onClick={() => salvar(() => setConfig("limite_diario", valor))}
          className={botao}
        >
          {pendente ? "…" : "Salvar"}
        </button>
      </div>
      <Aviso erro={erro} ok={ok} />
    </div>
  );
}

// --------------------------------------------------------------------------

export function EditorDificuldade({ d }: { d: Dificuldade }) {
  const [min, setMin] = useState(Math.round(d.duration_seconds / 60));
  const [mult, setMult] = useState(Number(d.xp_multiplier));
  const [minXp, setMinXp] = useState(d.min_xp);
  const { salvar, pendente, erro, ok } = useSalvar();

  const mudou =
    min !== Math.round(d.duration_seconds / 60) ||
    mult !== Number(d.xp_multiplier) ||
    minXp !== d.min_xp;

  return (
    <div className="space-y-2 rounded-xl border border-borda/60 bg-superficie/50 p-4">
      <p className="text-sm font-medium text-zinc-200">{d.label}</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-xs text-zinc-500">minutos</span>
          <input type="number" min={5} max={240} value={min}
            onChange={(e) => setMin(e.target.valueAsNumber)}
            className={`${campo} text-center font-mono`} />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">XP ×</span>
          <input type="number" step="0.05" min={0.05} max={5} value={mult}
            onChange={(e) => setMult(e.target.valueAsNumber)}
            className={`${campo} text-center font-mono`} />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">desbloqueio</span>
          <input type="number" min={0} step={100} value={minXp}
            onChange={(e) => setMinXp(e.target.valueAsNumber)}
            className={`${campo} text-center font-mono`} />
        </label>
      </div>
      <button
        type="button"
        disabled={pendente || !mudou}
        onClick={() =>
          salvar(() =>
            salvarDificuldade({
              id: d.id,
              durationSeconds: min * 60,
              xpMultiplier: mult,
              minXp,
            })
          )
        }
        className={botao}
      >
        {pendente ? "…" : "Salvar"}
      </button>
      <Aviso erro={erro} ok={ok} />
      <p className="text-xs leading-relaxed text-zinc-600">
        Não reescreve o passado: a duração é gravada na partida e o multiplicador
        é lido na correção.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------

export function LinhaTema({ t }: { t: TemaAdmin }) {
  const { salvar, pendente, erro } = useSalvar();
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(t.title);

  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editando ? (
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={campo}
            />
          ) : (
            <p className={`truncate text-sm ${t.active ? "text-zinc-200" : "text-zinc-600 line-through"}`}>
              {t.title}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-600">
            {t.is_custom ? "escrito por aluno · " : ""}
            {t.queimado_por} jogador(es) já receberam · {t.corrigidas} corrigida(s)
            {t.nota_media !== null && ` · média ${t.nota_media}`} · {t.dicas} dica(s)
          </p>
        </div>

        {!t.is_custom && (
          <div className="flex shrink-0 gap-2">
            {editando ? (
              <>
                <button
                  type="button"
                  disabled={pendente || titulo.trim().length < 10}
                  onClick={() =>
                    salvar(async () => {
                      await salvarTema({ id: t.id, title: titulo });
                      setEditando(false);
                    })
                  }
                  className="text-xs text-emerald-400 underline"
                >
                  salvar
                </button>
                <button type="button" onClick={() => { setEditando(false); setTitulo(t.title); }}
                  className="text-xs text-zinc-500 underline">
                  cancelar
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setEditando(true)}
                className="text-xs text-zinc-500 underline hover:text-zinc-300">
                renomear
              </button>
            )}
            <button
              type="button"
              disabled={pendente}
              onClick={() =>
                salvar(() =>
                  salvarTema({ id: t.id, active: !t.active })
                )
              }
              className={`text-xs underline ${t.active ? "text-amber-500" : "text-emerald-400"}`}
            >
              {t.active ? "desativar" : "ativar"}
            </button>
          </div>
        )}
      </div>
      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
    </div>
  );
}
