import { getUsoIA } from "@/app/admin-actions";
import { custoTotal, TEM_PRECOS, PRECOS } from "@/lib/custoIA";
import { BarraH, Grade, Metrica, Secao, Sparkline, Tabela, Vazio } from "../Painel";

export const dynamic = "force-dynamic";

export default async function AdminIA() {
  const ia = await getUsoIA();

  const tokensTotais = ia.porModelo.reduce(
    (s, m) => s + m.tokensIn + m.tokensOut,
    0
  );

  // O custo só aparece se lib/custoIA.ts tiver preço configurado. Estimar com
  // número inventado seria pior que não estimar: decisão de orçamento sai daqui.
  const custo = TEM_PRECOS
    ? custoTotal(
        ia.porModelo.map((m) => ({
          model: m.modelo,
          tokensIn: m.tokensIn,
          tokensOut: m.tokensOut,
        }))
      )
    : null;

  return (
    <div className="space-y-8">
      <Secao
        titulo="Consumo nas últimas 24 horas"
        nota="A cota do Gemini conta CHAMADAS, não redações. Manuscrita gasta duas (transcrição e avaliação); digitada gasta uma."
      >
        <Grade>
          <Metrica
            rotulo="Chamadas de IA"
            valor={ia.chamadas24h}
            tom={ia.chamadas24h > 15 ? "ruim" : ia.chamadas24h > 8 ? "alerta" : "bom"}
          />
          <Metrica rotulo="Redações enviadas" valor={ia.redacoes24h} />
          <Metrica rotulo="Teto por usuário" valor={ia.limiteDiario} sufixo="/24h" />
          <Metrica
            rotulo="Tokens acumulados"
            valor={tokensTotais.toLocaleString("pt-BR")}
            nota="desde sempre"
          />
        </Grade>
      </Secao>

      {ia.porDia.length >= 2 && (
        <Secao titulo="Correções por dia" nota="Últimos 14 dias.">
          <Sparkline
            valores={ia.porDia.map((d) => d.correcoes)}
            rotulos={ia.porDia.map((d) => d.dia.slice(5))}
          />
        </Secao>
      )}

      <Secao
        titulo="Por modelo"
        nota="É aqui que se vê o efeito de uma troca de modelo — e se alguma partida antiga ainda está sendo reprocessada no modelo velho."
      >
        {ia.porModelo.length === 0 ? (
          <Vazio>Nenhuma correção registrada ainda.</Vazio>
        ) : (
          <Tabela
            colunas={
              custo
                ? ["Modelo", "Correções", "Entrada", "Saída", "Custo (USD)"]
                : ["Modelo", "Correções", "Tokens de entrada", "Tokens de saída"]
            }
          >
            {ia.porModelo.map((m) => {
              const c = custo
                ? custoTotal([
                    { model: m.modelo, tokensIn: m.tokensIn, tokensOut: m.tokensOut },
                  ])
                : null;
              return (
                <tr key={m.modelo}>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-300">
                    {m.modelo}
                  </td>
                  <td className="tabular px-3 py-2 font-mono">{m.correcoes}</td>
                  <td className="tabular px-3 py-2 font-mono text-zinc-400">
                    {m.tokensIn.toLocaleString("pt-BR")}
                  </td>
                  <td className="tabular px-3 py-2 font-mono text-zinc-400">
                    {m.tokensOut.toLocaleString("pt-BR")}
                  </td>
                  {custo && (
                    <td className="tabular px-3 py-2 font-mono text-emerald-400">
                      {c && c.desconhecidas === 0
                        ? `$${c.usd.toFixed(4)}`
                        : "preço não configurado"}
                    </td>
                  )}
                </tr>
              );
            })}
          </Tabela>
        )}

        {!TEM_PRECOS && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-500">
            O custo em dólar não aparece porque{" "}
            <code className="text-zinc-400">PRECOS</code> em{" "}
            <code className="text-zinc-400">lib/custoIA.ts</code> está vazio — de
            propósito. Preço inventado vira estimativa com cara de fato, e é em
            cima dela que decisão de orçamento é tomada. Preencha com os valores
            do seu painel de billing e a coluna aparece.
          </p>
        )}
        {TEM_PRECOS && (
          <p className="text-xs text-zinc-600">
            Preços conferidos em{" "}
            {[...new Set(Object.values(PRECOS).map((p) => p.conferidoEm))].join(", ")}.
            Correção manuscrita paga dois modelos na mesma linha, então o valor
            dela é rateado pela média — aproximação, não fatura.
          </p>
        )}
      </Secao>

      <Secao
        titulo="Quem mais consome"
        nota="Correções nos últimos 30 dias. A cota é compartilhada: um usuário sozinho pode esgotar o dia de todos."
      >
        {ia.topUsuarios.length === 0 ? (
          <Vazio>Nenhuma correção nos últimos 30 dias.</Vazio>
        ) : (
          <BarraH
            itens={ia.topUsuarios.map((u, i) => ({
              rotulo: `${u.username} · ${u.tokens.toLocaleString("pt-BR")} tokens`,
              valor: u.correcoes,
              destaque: i === 0,
            }))}
            formato={(n) => `${n} correções`}
          />
        )}
      </Secao>
    </div>
  );
}
