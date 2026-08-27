"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  pedirAmizade,
  responderAmizade,
  criarDuelo,
  type Amigo,
} from "@/app/duel-actions";
import type { Dificuldade } from "@/app/actions";

export default function Amigos({
  amigos,
  meuCodigo,
  dificuldades,
}: {
  amigos: Amigo[];
  meuCodigo: string;
  dificuldades: Dificuldade[];
}) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [desafiando, setDesafiando] = useState<string | null>(null);

  const pendentesRecebidos = amigos.filter((a) => a.status === "pendente" && !a.sou_solicitante);
  const pendentesEnviados = amigos.filter((a) => a.status === "pendente" && a.sou_solicitante);
  const aceitos = amigos.filter((a) => a.status === "aceito");

  const liberadas = dificuldades.filter((d) => d.desbloqueada);

  async function agir<T>(chave: string, fn: () => Promise<T>) {
    setErro(null);
    setMsg(null);
    setOcupado(chave);
    try {
      const r = await fn();
      if (typeof r === "string") setMsg(r);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="space-y-5">
      {/* ---- meu código ---- */}
      <div className="rounded-2xl border border-borda/60 bg-superficie/50 p-4">
        <p className="text-xs text-zinc-500">Seu código de amigo</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="tabular font-mono text-2xl font-bold tracking-[0.2em] text-emerald-400">
            {meuCodigo}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(meuCodigo);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                // Sem permissão de área de transferência: o código está à vista,
                // dá para digitar. Não vale quebrar a tela por isso.
                setCopiado(false);
              }
            }}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium hover:bg-zinc-700"
          >
            {copiado ? "copiado" : "copiar"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          Ninguém consegue te achar por nome — só por este código. Mande para
          quem você quiser adicionar.
        </p>
      </div>

      {/* ---- adicionar ---- */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CÓDIGO"
            autoComplete="off"
            spellCheck={false}
            className="tabular min-w-0 flex-1 rounded-lg border border-borda bg-superficie px-4 py-3 font-mono tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-600 focus:border-zinc-600"
          />
          <button
            type="button"
            disabled={codigo.length !== 6 || ocupado === "add"}
            onClick={() => agir("add", () => pedirAmizade(codigo).then((m) => { setCodigo(""); return m; }))}
            className="shrink-0 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 disabled:opacity-40"
          >
            {ocupado === "add" ? "…" : "adicionar"}
          </button>
        </div>
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
        {erro && <p className="text-xs text-amber-400">{erro}</p>}
      </div>

      {/* ---- pedidos recebidos ---- */}
      {pendentesRecebidos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500">
            Pedidos recebidos
          </h3>
          {pendentesRecebidos.map((a) => (
            <div
              key={a.friendship_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3"
            >
              <span className="min-w-0 truncate text-sm">{a.username}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={ocupado === a.friendship_id}
                  onClick={() => agir(a.friendship_id, () => responderAmizade(a.friendship_id, true))}
                  className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold text-emerald-950 disabled:opacity-50"
                >
                  aceitar
                </button>
                <button
                  type="button"
                  disabled={ocupado === a.friendship_id}
                  onClick={() => agir(a.friendship_id, () => responderAmizade(a.friendship_id, false))}
                  className="rounded-md px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  recusar
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ---- lista ---- */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Amigos ({aceitos.length})
        </h3>

        {aceitos.length === 0 && pendentesEnviados.length === 0 && (
          <p className="rounded-xl border border-dashed border-borda p-6 text-center text-sm text-zinc-500">
            Ninguém ainda. Troque códigos com alguém para poder duelar.
          </p>
        )}

        {aceitos.map((a) => (
          <div key={a.friendship_id} className="rounded-xl border border-borda/60 bg-superficie/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-zinc-200">{a.username}</span>
                <span className="tabular block font-mono text-xs text-zinc-600">
                  {Number(a.xp).toLocaleString("pt-BR")} XP
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDesafiando(desafiando === a.amigo_id ? null : a.amigo_id)}
                className="shrink-0 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium hover:bg-zinc-700"
              >
                {desafiando === a.amigo_id ? "cancelar" : "desafiar"}
              </button>
            </div>

            {desafiando === a.amigo_id && (
              <div className="mt-3 space-y-2 border-t border-borda/60 pt-3">
                <p className="text-xs text-zinc-500">
                  Escolha a dificuldade. Os dois jogam o mesmo tema, cada um na
                  sua hora.
                </p>
                <div className="flex flex-wrap gap-2">
                  {liberadas.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={ocupado === a.amigo_id}
                      onClick={() =>
                        agir(a.amigo_id, async () => {
                          await criarDuelo(a.amigo_id, d.id);
                          setDesafiando(null);
                        })
                      }
                      className="rounded-lg border border-borda px-3 py-2 text-xs hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-50"
                    >
                      {d.label} · {Math.round(d.duration_seconds / 60)} min
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {pendentesEnviados.map((a) => (
          <div
            key={a.friendship_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-borda/40 p-3 opacity-60"
          >
            <span className="min-w-0 truncate text-sm text-zinc-400">{a.username}</span>
            <span className="shrink-0 text-xs text-zinc-600">aguardando resposta</span>
          </div>
        ))}
      </div>
    </section>
  );
}
