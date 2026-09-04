import Link from "next/link";
import { notFound } from "next/navigation";
import { getPartida } from "@/app/admin-actions";
import { Grade, Metrica, Secao, Vazio } from "../../Painel";

export const dynamic = "force-dynamic";

type Correcao = {
  tentativa: number;
  c1: number; c2: number; c3: number; c4: number; c5: number;
  total: number;
  rubrica: string;
  modelo: string;
  tokens: number;
  feedback: Record<string, unknown>;
  criadaEm: string;
};

type Detalhe = {
  id: string; username: string; tema: string; enunciado: string;
  temaProprio: boolean; status: string; isFree: boolean;
  criadaEm: string; enviadaEm: string | null;
  segundosGastos: number | null; duracao: number;
  xpFinal: number | null; sinalizada: boolean;
  origem: string | null; legibilidade: number | null; contestada: boolean;
  transcricao: string | null;
  correcoes: Correcao[];
  dicasAbertas: number;
};

const NOMES = ["Norma culta", "Repertório", "Argumentação", "Coesão", "Intervenção"];

/**
 * Detalhe de uma redação.
 *
 * Só de abrir esta página, admin_partida() grava a leitura em
 * admin_access_log. Não existe pré-carregamento nem prefetch desta rota por
 * isso — um hover não pode virar registro de acesso.
 */
export default async function AdminRedacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let d: Detalhe;
  try {
    d = (await getPartida(id)) as unknown as Detalhe;
  } catch {
    notFound();
  }

  const atual = d.correcoes[0];
  const minutos = Math.round((d.segundosGastos ?? 0) / 60);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{d.tema}</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {d.username} · {new Date(d.criadaEm).toLocaleString("pt-BR")}
            {d.isFree && " · treino livre"}
            {d.temaProprio && " · tema escrito pelo aluno"}
          </p>
        </div>
        <Link
          href="/admin/redacoes"
          prefetch={false}
          className="text-xs text-zinc-500 underline hover:text-zinc-300"
        >
          voltar à lista
        </Link>
      </div>

      <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-300/90">
        Esta leitura foi registrada em nome da sua conta. Redação é texto pessoal
        de aluno.
      </p>

      <Grade>
        <Metrica
          rotulo="Nota"
          valor={atual ? atual.total : "—"}
          sufixo={atual ? "/1000" : undefined}
        />
        <Metrica rotulo="XP" valor={d.isFree ? "sem XP" : (d.xpFinal ?? "—")} />
        <Metrica
          rotulo="Tempo"
          valor={minutos}
          sufixo="min"
          nota={`de ${Math.round(d.duracao / 60)} disponíveis`}
        />
        <Metrica
          rotulo="Entrega"
          valor={d.origem === "typed" ? "digitada" : "à mão"}
          nota={
            d.legibilidade !== null
              ? `legibilidade ${(d.legibilidade * 100).toFixed(0)}%`
              : undefined
          }
          tom={d.legibilidade !== null && d.legibilidade < 0.6 ? "alerta" : "neutro"}
        />
      </Grade>

      {(d.contestada || d.sinalizada || d.dicasAbertas > 0) && (
        <p className="text-xs text-zinc-500">
          {d.contestada && "Transcrição contestada. "}
          {d.sinalizada && "Sinalizada (código da folha ausente ou colagem). "}
          {d.dicasAbertas > 0 && `${d.dicasAbertas} dica(s) aberta(s).`}
        </p>
      )}

      <Secao titulo="Proposta">
        <p className="rounded-lg bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-300">
          {d.enunciado}
        </p>
      </Secao>

      <Secao
        titulo="Transcrição"
        nota="Como a etapa de visão leu a folha — com os erros do aluno preservados. Se aqui aparecer texto corrigido, é o modelo de visão consertando o que não devia."
      >
        {d.transcricao ? (
          <pre className="whitespace-pre-wrap rounded-lg bg-zinc-900 p-4 font-sans text-sm leading-relaxed text-zinc-300">
            {d.transcricao}
          </pre>
        ) : (
          <Vazio>Sem transcrição — a partida não chegou a ser lida.</Vazio>
        )}
      </Secao>

      <Secao
        titulo="Correções"
        nota={
          d.correcoes.length > 1
            ? `${d.correcoes.length} tentativas. A que vale é a mais recente; as anteriores ficam como evidência da contestação.`
            : undefined
        }
      >
        {d.correcoes.length === 0 ? (
          <Vazio>Ainda não corrigida.</Vazio>
        ) : (
          d.correcoes.map((c) => (
            <div
              key={c.tentativa}
              className="space-y-3 rounded-lg border border-zinc-800 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-500">
                <span>
                  Tentativa {c.tentativa} · rubrica <code>{c.rubrica}</code> ·{" "}
                  <code>{c.modelo}</code>
                </span>
                <span className="font-mono">
                  {c.tokens.toLocaleString("pt-BR")} tokens ·{" "}
                  {new Date(c.criadaEm).toLocaleString("pt-BR")}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[c.c1, c.c2, c.c3, c.c4, c.c5].map((n, i) => (
                  <div key={i} className="rounded-md bg-zinc-900 p-2 text-center">
                    <p className="text-xs text-zinc-600">C{i + 1}</p>
                    <p className="tabular font-mono text-lg font-bold">{n}</p>
                    <p className="text-[10px] leading-tight text-zinc-600">
                      {NOMES[i]}
                    </p>
                  </div>
                ))}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                  feedback bruto do modelo
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-400">
                  {JSON.stringify(c.feedback, null, 2)}
                </pre>
              </details>
            </div>
          ))
        )}
      </Secao>
    </div>
  );
}
