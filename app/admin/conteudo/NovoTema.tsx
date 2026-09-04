"use client";

import { useState, useTransition } from "react";
import { salvarTema } from "@/app/admin-actions";

const campo =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600";

/**
 * Criação de tema do catálogo.
 *
 * Os textos motivadores entram aqui porque sem eles o tema nasce pior que os do
 * seed: a trava da C2 ("repertório que só existe nos motivadores não passa de
 * 120") precisa ter o que comparar, e um tema sem motivadores desliga essa
 * verificação inteira.
 */
export default function NovoTema() {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [enunciado, setEnunciado] = useState("");
  const [motivadores, setMotivadores] = useState<{ source: string; content: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const valido = titulo.trim().length >= 10 && enunciado.trim().length >= 40;

  function enviar() {
    iniciar(async () => {
      setErro(null);
      try {
        await salvarTema({
          title: titulo,
          statement: enunciado,
          supportingTexts: motivadores.filter((m) => m.content.trim()),
          active: true,
        });
        setTitulo(""); setEnunciado(""); setMotivadores([]); setAberto(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falhou");
      }
    });
  }

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-lg border border-dashed border-zinc-700 p-3 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
      >
        + novo tema
      </button>
    );

  return (
    <div className="space-y-3 rounded-lg border border-zinc-700 p-4">
      <label className="block">
        <span className="text-xs text-zinc-500">Tema (mínimo 10 caracteres)</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Desafios da mobilidade urbana nas capitais brasileiras"
          className={`${campo} mt-1`} />
      </label>

      <label className="block">
        <span className="text-xs text-zinc-500">
          Enunciado da proposta (mínimo 40 caracteres)
        </span>
        <textarea value={enunciado} onChange={(e) => setEnunciado(e.target.value)} rows={3}
          placeholder="A partir da leitura dos textos motivadores e com base nos conhecimentos construídos ao longo de sua formação, redija um texto dissertativo-argumentativo…"
          className={`${campo} mt-1 resize-none`} />
      </label>

      <div className="space-y-2">
        <span className="text-xs text-zinc-500">Textos motivadores</span>
        {motivadores.map((m, i) => (
          <div key={i} className="space-y-1 rounded-md border border-zinc-800 p-2">
            <input value={m.source} placeholder="fonte (ex.: IBGE, 2024)"
              onChange={(e) => setMotivadores(motivadores.map((x, j) =>
                j === i ? { ...x, source: e.target.value } : x))}
              className={`${campo} text-xs`} />
            <textarea value={m.content} rows={2} placeholder="conteúdo do texto motivador"
              onChange={(e) => setMotivadores(motivadores.map((x, j) =>
                j === i ? { ...x, content: e.target.value } : x))}
              className={`${campo} resize-none text-xs`} />
            <button type="button"
              onClick={() => setMotivadores(motivadores.filter((_, j) => j !== i))}
              className="text-xs text-red-400 underline">remover</button>
          </div>
        ))}
        <button type="button"
          onClick={() => setMotivadores([...motivadores, { source: "", content: "" }])}
          className="text-xs text-zinc-500 underline hover:text-zinc-300">
          + texto motivador
        </button>
        <p className="text-xs leading-relaxed text-zinc-600">
          Prefira lei e fato histórico verificável a estatística com número — a
          disciplina do acervo é não ensinar dado errado.
        </p>
      </div>

      {erro && <p className="text-xs leading-relaxed text-red-400">{erro}</p>}

      <div className="flex gap-2">
        <button type="button" disabled={pendente || !valido} onClick={enviar}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
          {pendente ? "…" : "Criar tema"}
        </button>
        <button type="button" onClick={() => setAberto(false)}
          className="text-sm text-zinc-500 underline">cancelar</button>
      </div>
    </div>
  );
}
