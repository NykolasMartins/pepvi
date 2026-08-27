/**
 * XP acumulado vira nível. Puro, sem banco.
 *
 * Por que nível e não moeda: gastar XP em dicas transformaria o XP em economia,
 * e economia tem um efeito perverso aqui — quem tem pouco XP é justamente quem
 * mais precisa de dica, e ficaria sem poder pagar. O custo da dica já está
 * pago como penalidade da partida. O XP acumulado é placar, não carteira.
 *
 * Curva calibrada para ~700-900 XP por partida boa: o nível 8 fica em torno de
 * 30 partidas. Constante nomeada porque é balanceamento de jogo — vai mudar
 * depois de ver gente jogando.
 *
 * Autoteste: `node lib/levels.check.ts`
 */

export type Nivel = {
  numero: number;
  nome: string;
  /** XP acumulado necessário para alcançar este nível. */
  xpMinimo: number;
};

export const NIVEIS: Nivel[] = [
  { numero: 1, nome: "Rascunho", xpMinimo: 0 },
  { numero: 2, nome: "Parágrafo", xpMinimo: 1_000 },
  { numero: 3, nome: "Tese", xpMinimo: 2_500 },
  { numero: 4, nome: "Argumento", xpMinimo: 5_000 },
  { numero: 5, nome: "Repertório", xpMinimo: 8_500 },
  { numero: 6, nome: "Coesão", xpMinimo: 13_000 },
  { numero: 7, nome: "Intervenção", xpMinimo: 18_500 },
  { numero: 8, nome: "Nota Mil", xpMinimo: 25_000 },
];

export type ProgressoNivel = {
  atual: Nivel;
  /** null no último nível — não existe próximo, e a tela precisa saber disso. */
  proximo: Nivel | null;
  xpNoNivel: number;
  xpParaProximo: number | null;
  /** 0 a 1. No último nível é sempre 1. */
  fracao: number;
};

export function nivelDe(xpTotal: number): ProgressoNivel {
  // XP negativo não existe, mas dado corrompido não pode quebrar a tela.
  const xp = Math.max(0, Math.floor(xpTotal));

  let indice = 0;
  for (let i = 0; i < NIVEIS.length; i++) {
    if (xp >= NIVEIS[i].xpMinimo) indice = i;
  }

  const atual = NIVEIS[indice];
  const proximo = NIVEIS[indice + 1] ?? null;

  if (!proximo) {
    return { atual, proximo: null, xpNoNivel: xp - atual.xpMinimo, xpParaProximo: null, fracao: 1 };
  }

  const faixa = proximo.xpMinimo - atual.xpMinimo;
  const xpNoNivel = xp - atual.xpMinimo;

  return {
    atual,
    proximo,
    xpNoNivel,
    xpParaProximo: proximo.xpMinimo - xp,
    fracao: xpNoNivel / faixa,
  };
}
