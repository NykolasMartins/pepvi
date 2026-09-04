import { getQualidade } from "@/app/admin-actions";
import { RUBRIC_VERSION } from "@/lib/rubric";
import { BarraH, Grade, Metrica, Secao, Tabela, Vazio } from "../Painel";

export const dynamic = "force-dynamic";

const COMPETENCIAS = ["c1", "c2", "c3", "c4", "c5"] as const;

export default async function AdminQualidade() {
  const q = await getQualidade();

  const taxaContestacao =
    q.submissoes > 0 ? (q.contestadas / q.submissoes) * 100 : null;

  return (
    <div className="space-y-8">
      <Secao titulo="Sinais">
        <Grade>
          <Metrica
            rotulo="Contestações"
            valor={q.contestadas}
            nota={
              taxaContestacao === null
                ? "sem envios ainda"
                : `${taxaContestacao.toFixed(1)}% dos envios`
            }
            tom={taxaContestacao !== null && taxaContestacao > 10 ? "alerta" : "neutro"}
          />
          <Metrica
            rotulo="Cinco notas iguais"
            valor={q.suspeitas}
            tom={q.suspeitas > 0 ? "alerta" : "bom"}
            nota="assinatura de modelo que não está diferenciando nada"
          />
          <Metrica rotulo="Zeradas" valor={q.zeradas} nota="fuga ao tema ou não dissertativo" />
          <Metrica rotulo="Reprocessadas" valor={q.reprocessadas} nota="mais de uma tentativa" />
        </Grade>
      </Secao>

      <Secao
        titulo="Média por versão da rubrica"
        nota={`A rubrica em uso é ${RUBRIC_VERSION}. Comparar versões é como se mede se uma mudança aproximou ou afastou as notas da banca — notas de versões diferentes não são comparáveis entre si, por isso a coluna existe.`}
      >
        {q.porVersao.length === 0 ? (
          <Vazio>Nenhuma correção registrada ainda.</Vazio>
        ) : (
          <Tabela colunas={["Rubrica", "Correções", "Média", "C1", "C2", "C3", "C4", "C5"]}>
            {q.porVersao.map((v) => (
              <tr key={v.versao} className={v.versao === RUBRIC_VERSION ? "bg-emerald-950/20" : ""}>
                <td className="px-3 py-2">
                  <code className={v.versao === RUBRIC_VERSION ? "text-emerald-300" : "text-zinc-400"}>
                    {v.versao}
                  </code>
                  {v.versao === RUBRIC_VERSION && (
                    <span className="ml-2 text-xs text-emerald-600">em uso</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 font-mono">{v.correcoes}</td>
                <td className="tabular px-3 py-2 font-mono font-bold">{v.media}</td>
                {COMPETENCIAS.map((c) => (
                  <td key={c} className="tabular px-3 py-2 font-mono text-zinc-400">
                    {v[c]}
                  </td>
                ))}
              </tr>
            ))}
          </Tabela>
        )}
        {q.porVersao.length === 1 && (
          <p className="text-xs leading-relaxed text-zinc-600">
            Só uma versão medida até agora. A comparação só fica útil depois que
            houver correções suficientes na versão nova — antes disso, a diferença
            é ruído.
          </p>
        )}
      </Secao>

      <Secao
        titulo="Distribuição das notas"
        nota="Notas empilhadas numa faixa só é o sintoma de regressão à média: o modelo devolvendo o valor central em vez de avaliar."
      >
        {q.faixas.length === 0 ? (
          <Vazio>Nenhuma correção registrada ainda.</Vazio>
        ) : (
          <BarraH
            itens={q.faixas.map((f) => ({
              rotulo: `${f.de} – ${f.de + 199}`,
              valor: f.quantas,
              destaque: f.de === 600,
            }))}
          />
        )}
      </Secao>
    </div>
  );
}
