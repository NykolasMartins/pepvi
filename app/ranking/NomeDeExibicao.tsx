"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUsername } from "@/app/actions";

/**
 * Nome exibido no ranking.
 *
 * Existe porque o nome antigo era gerado a partir do e-mail. Enquanto ninguém
 * via o perfil dos outros isso era inofensivo; com ranking, expõe a parte local
 * do e-mail de todo mundo. Contas novas já nascem com nome neutro; esta caixa é
 * para quem veio de antes — e para quem quer escolher o próprio.
 */
export default function NomeDeExibicao({ atual }: { atual: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(atual);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const pareceEmail = atual.includes("@") || /^[^-]*[._][^-]*-/.test(atual);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await updateUsername(nome);
      setAberto(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-xs">
        <span className="text-zinc-500">
          Você aparece como{" "}
          <strong className="text-zinc-300">{atual || "(sem nome)"}</strong>
        </span>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={pareceEmail ? "text-amber-400 underline" : "text-emerald-400 underline"}
        >
          {pareceEmail ? "seu nome parece vir do e-mail — trocar" : "trocar"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-zinc-900 p-4">
      <label className="block text-xs text-zinc-500">
        Nome no ranking
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={24}
          autoFocus
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
      </label>
      <p className="text-xs text-zinc-600">
        Visível para todos os jogadores. De 3 a 24 caracteres, sem e-mail.
      </p>
      {erro && <p className="text-xs text-amber-400">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || nome.trim() === atual}
          className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50"
        >
          {salvando ? "salvando…" : "salvar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNome(atual);
            setAberto(false);
            setErro(null);
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          cancelar
        </button>
      </div>
    </div>
  );
}
