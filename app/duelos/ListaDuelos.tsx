"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { responderDuelo, jogarDuelo, type Duelo } from "@/app/duel-actions";

const RESULTADO = {
  ganhei: { rotulo: "Você venceu", cor: "text-emerald-400", borda: "border-emerald-800" },
  perdi: { rotulo: "Você perdeu", cor: "text-red-400", borda: "border-red-900/60" },
  empate: { rotulo: "Empate", cor: "text-zinc-300", borda: "border-borda" },
  aguardando: { rotulo: "Em andamento", cor: "text-zinc-400", borda: "border-borda/60" },
} as const;

function quandoExpira(iso: string) {
  const dias = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (dias <= 0) return "expirado";
  return dias === 1 ? "expira amanhã" : `expira em ${dias} dias`;
}

export default function ListaDuelos({ duelos }: { duelos: Duelo[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function agir(chave: string, fn: () => Promise<unknown>) {
    setErro(null);
    setOcupado(chave);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      // redirect() da Server Action se propaga como erro; deixa passar.
      if (e && typeof e === "object" && "digest" in e) throw e;
      setErro(e instanceof Error ? e.message : String(e));
      setOcupado(null);
    }
  }

  const abertos = duelos.filter(
    (d) => !d.expirado && d.status !== "recusado" && d.resultado === "aguardando"
  );
  const fechados = duelos.filter(
    (d) => d.expirado || d.status === "recusado" || d.resultado !== "aguardando"
  );

  if (duelos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-borda p-8 text-center text-sm text-zinc-500">
        Nenhum duelo ainda. Desafie um amigo na lista acima.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {erro && (
        <p className="rounded-lg bg-amber-950/50 p-3 text-xs text-amber-300">{erro}</p>
      )}

      {abertos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Em aberto
          </h3>
          {abertos.map((d) => (
            <Cartao key={d.duel_id} d={d} ocupado={ocupado} agir={agir} />
          ))}
        </div>
      )}

      {fechados.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Encerrados
          </h3>
          {fechados.map((d) => (
            <Cartao key={d.duel_id} d={d} ocupado={ocupado} agir={agir} />
          ))}
        </div>
      )}
    </div>
  );
}

function Cartao({
  d,
  ocupado,
  agir,
}: {
  d: Duelo;
  ocupado: string | null;
  agir: (chave: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const r = RESULTADO[d.resultado];
  const encerrado = d.resultado !== "aguardando";
  const convitePendente = d.status === "pendente" && !d.sou_desafiante && !d.expirado;
  const esperandoResposta = d.status === "pendente" && d.sou_desafiante && !d.expirado;
  const podeJogar = d.status === "ativo" && !d.minha_match_id && !d.expirado;
  const jogando = d.minha_match_id && !d.meu_xp;

  return (
    <div className={`space-y-3 rounded-xl border p-4 ${encerrado ? r.borda : "border-borda/60"} bg-superficie/40`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">
            vs <span className="text-emerald-400">{d.oponente_nome}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{d.tema_titulo}</p>
        </div>
        <span className={`shrink-0 text-right text-xs font-semibold ${encerrado ? r.cor : "text-zinc-600"}`}>
          {d.status === "recusado"
            ? "recusado"
            : d.expirado && !encerrado
              ? "expirado"
              : encerrado
                ? r.rotulo
                : quandoExpira(d.expira_em)}
        </span>
      </div>

      {/* Placar dos dois lados, sempre visível: é o ponto do duelo. */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <Placar rotulo="você" xp={d.meu_xp} status={d.minha_status} destaque={d.resultado === "ganhei"} />
        <Placar
          rotulo={d.oponente_nome}
          xp={d.oponente_xp}
          status={d.oponente_status}
          destaque={d.resultado === "perdi"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-zinc-400">{d.dificuldade}</span>

        {convitePendente && (
          <>
            <button
              type="button"
              disabled={ocupado === d.duel_id}
              onClick={() => agir(d.duel_id, () => responderDuelo(d.duel_id, true))}
              className="rounded-md bg-emerald-500 px-3 py-2 font-bold text-emerald-950 disabled:opacity-50"
            >
              aceitar desafio
            </button>
            <button
              type="button"
              disabled={ocupado === d.duel_id}
              onClick={() => agir(d.duel_id, () => responderDuelo(d.duel_id, false))}
              className="px-2 py-2 text-zinc-500 hover:text-zinc-300"
            >
              recusar
            </button>
          </>
        )}

        {esperandoResposta && <span className="text-zinc-600">aguardando aceitar</span>}

        {podeJogar && (
          <button
            type="button"
            disabled={ocupado === d.duel_id}
            onClick={() => agir(d.duel_id, () => jogarDuelo(d.duel_id))}
            className="rounded-md bg-emerald-500 px-4 py-2 font-bold text-emerald-950 disabled:opacity-50"
          >
            {ocupado === d.duel_id ? "abrindo…" : "jogar minha parte"}
          </button>
        )}

        {jogando && d.minha_match_id && (
          <Link
            href={`/match/${d.minha_match_id}`}
            className="rounded-md bg-zinc-800 px-4 py-2 font-medium hover:bg-zinc-700"
          >
            continuar minha partida
          </Link>
        )}

        {encerrado && d.minha_match_id && (
          <Link href={`/match/${d.minha_match_id}/result`} className="text-emerald-400 underline">
            ver minha correção
          </Link>
        )}
      </div>
    </div>
  );
}

function Placar({
  rotulo,
  xp,
  status,
  destaque,
}: {
  rotulo: string;
  xp: number | null;
  status: string | null;
  destaque: boolean;
}) {
  return (
    <div className={`rounded-lg p-2 ${destaque ? "bg-emerald-950/40" : "bg-zinc-900/60"}`}>
      <p className="truncate text-xs text-zinc-500">{rotulo}</p>
      <p className={`tabular font-mono text-lg font-bold ${xp === null ? "text-zinc-700" : "text-zinc-100"}`}>
        {xp ?? "—"}
      </p>
      <p className="text-xs text-zinc-600">
        {xp !== null
          ? "XP"
          : status === null
            ? "não começou"
            : status === "in_progress"
              ? "escrevendo"
              : status === "grading"
                ? "corrigindo"
                : status}
      </p>
    </div>
  );
}
