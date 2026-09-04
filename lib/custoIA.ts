/**
 * Custo das chamadas de IA, em dólar.
 *
 * A tabela está VAZIA de propósito. Preço de API muda, e um número inventado
 * aqui vira um custo estimado com aparência de fato — pior que não estimar,
 * porque decisão de orçamento é tomada em cima dele. Enquanto uma entrada não
 * existir, o painel mostra os tokens e omite o valor.
 *
 * Para preencher: console.cloud.google.com > Billing, ou a página de preços do
 * Gemini. Os valores são por MILHÃO de tokens, e entrada e saída têm preços
 * diferentes — thinking é cobrado como saída (ver usageOf em lib/gemini.ts).
 *
 * Anote a data ao lado: daqui a um ano, saber que o número é velho vale mais
 * que o número.
 *
 * Autoteste: `node lib/custoIA.check.ts`
 */
export type PrecoModelo = {
  /** USD por 1 milhão de tokens de entrada. */
  entrada: number;
  /** USD por 1 milhão de tokens de saída (inclui thinking). */
  saida: number;
  /** Data em que o preço foi conferido, YYYY-MM-DD. */
  conferidoEm: string;
};

export const PRECOS: Record<string, PrecoModelo> = {
  // "gemini-3.6-flash":      { entrada: 0, saida: 0, conferidoEm: "2026-09-03" },
  // "gemini-3.5-flash-lite": { entrada: 0, saida: 0, conferidoEm: "2026-09-03" },
};

/**
 * Custo de uma linha de correction. Devolve null quando o preço do modelo é
 * desconhecido — null é "não sei", e a tela precisa distinguir isso de zero.
 *
 * O `model` de uma correção manuscrita é "visao+avaliacao" (ver gradeMatch),
 * porque a mesma linha paga as duas etapas. Os tokens já vêm somados, então o
 * custo é rateado pelo preço de cada modelo — sem saber a divisão exata dos
 * tokens, a média dos dois é a aproximação honesta, e ela é sinalizada.
 */
export function custoDaCorrecao(
  model: string,
  tokensIn: number,
  tokensOut: number
): { usd: number; aproximado: boolean } | null {
  const partes = model.split("+").filter(Boolean);
  const precos = partes.map((p) => PRECOS[p]);
  if (precos.length === 0 || precos.some((p) => !p)) return null;

  const media = (f: (p: PrecoModelo) => number) =>
    precos.reduce((s, p) => s + f(p), 0) / precos.length;

  const usd =
    (Math.max(0, tokensIn) / 1_000_000) * media((p) => p.entrada) +
    (Math.max(0, tokensOut) / 1_000_000) * media((p) => p.saida);

  return { usd, aproximado: partes.length > 1 };
}

/** Soma o custo de várias correções. `desconhecidas` conta as sem preço. */
export function custoTotal(
  linhas: { model: string; tokensIn: number; tokensOut: number }[]
): { usd: number; desconhecidas: number; aproximadas: number } {
  let usd = 0, desconhecidas = 0, aproximadas = 0;
  for (const l of linhas) {
    const c = custoDaCorrecao(l.model, l.tokensIn, l.tokensOut);
    if (!c) { desconhecidas++; continue; }
    usd += c.usd;
    if (c.aproximado) aproximadas++;
  }
  return { usd, desconhecidas, aproximadas };
}

/** Há algum preço configurado? A tela usa para decidir se mostra a coluna. */
export const TEM_PRECOS = Object.keys(PRECOS).length > 0;
