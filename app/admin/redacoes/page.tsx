import Link from "next/link";
import { getPartidas, getAcessos } from "@/app/admin-actions";
import { Secao, Tabela, Vazio } from "../Painel";

export const dynamic = "force-dynamic";

const FILTROS = [
  { id: "todas", rotulo: "Todas" },
  { id: "problemas", rotulo: "Com problema" },
  { id: "corrigidas", rotulo: "Corrigidas" },
] as const;

/**
 * Lista de partidas.
 *
 * A lista NÃO traz o texto das redações — só metadados. O texto sai apenas no
 * detalhe, por admin_partida(), que registra o acesso na mesma transação.
 * Trazer transcrição aqui geraria uma linha de log por item a cada abertura da
 * lista, e o registro perderia o sentido.
 */
export default async function AdminRedacoes({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filtro = FILTROS.some((x) => x.id === f) ? f! : "todas";

  const [partidas, acessos] = await Promise.all([
    getPartidas(filtro, 100),
    getAcessos(10),
  ]);

  return (
    <div className="space-y-8">
      <nav className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {FILTROS.map((x) => (
          <Link
            key={x.id}
            href={`/admin/redacoes?f=${x.id}`}
            aria-current={filtro === x.id ? "page" : undefined}
            className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition ${
              filtro === x.id
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {x.rotulo}
          </Link>
        ))}
      </nav>

      <Secao
        titulo={`${partidas.length} partida${partidas.length === 1 ? "" : "s"}`}
        nota="Abrir uma redação registra quem leu e quando — é texto pessoal de aluno."
      >
        {partidas.length === 0 ? (
          <Vazio>Nenhuma partida neste filtro.</Vazio>
        ) : (
          <Tabela colunas={["Aluno", "Tema", "Status", "Nota", "Quando", ""]}>
            {partidas.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-900/60">
                <td className="px-3 py-2 text-zinc-300">{p.username}</td>
                <td className="max-w-xs truncate px-3 py-2 text-zinc-400">
                  {p.tema}
                  {p.is_free && (
                    <span className="ml-2 text-xs text-zinc-600">livre</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.status === "graded"
                        ? "bg-emerald-950 text-emerald-400"
                        : p.status === "grading_failed"
                          ? "bg-red-950 text-red-400"
                          : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {p.status}
                  </span>
                  {p.contestada && (
                    <span className="ml-2 text-xs text-amber-500">contestada</span>
                  )}
                  {p.sinalizada && (
                    <span className="ml-2 text-xs text-amber-500">sinalizada</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 font-mono">
                  {p.nota ?? <span className="text-zinc-700">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600">
                  {new Date(p.criada_em).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/redacoes/${p.id}`}
                    className="whitespace-nowrap text-xs text-emerald-400 underline"
                  >
                    abrir
                  </Link>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Secao>

      <Secao
        titulo="Últimas leituras registradas"
        nota="Toda abertura de redação entra aqui, inclusive as suas."
      >
        {acessos.length === 0 ? (
          <Vazio>Nenhuma redação foi aberta ainda.</Vazio>
        ) : (
          <Tabela colunas={["Quem leu", "Redação de", "Quando"]}>
            {acessos.map((a, i) => (
              <tr key={`${a.match_id}-${i}`}>
                <td className="px-3 py-2 text-zinc-300">{a.admin}</td>
                <td className="px-3 py-2 text-zinc-400">{a.aluno}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {new Date(a.lido_em).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
