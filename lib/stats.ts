/**
 * Agregação do progresso. Puro, sem banco e sem IA.
 *
 * Mora aqui e não no componente porque tem duas armadilhas que não lançam
 * exceção: divisão por zero (usuário sem partida) e tendência calculada de
 * pontos insuficientes. Nenhuma das duas quebra a tela — as duas mentem.
 *
 * Autoteste: `node lib/grading.check.ts`
 */

/** Abaixo disto, tendência é ruído. Não mostramos. */
export const MIN_PARTIDAS_PARA_TENDENCIA = 4;

export type PartidaConcluida = {
  id: string;
  temaTitulo: string;
  criadaEm: string;
  status: string;
  expirada: boolean;
  isReplay: boolean;
  /**
   * Treino livre. Entra nas médias — é redação corrigida com a mesma rubrica,
   * e escondê-la faria a evolução do aluno sumir do gráfico. Não entra em XP,
   * que já vem zero, nem no ranking, que é filtrado no Postgres.
   */
  livre: boolean;
  origem: string | null; // 'handwritten' | 'typed'
  notaBruta: number;
  xpFinal: number;
  penalidadeDicas: number;
  bonusVelocidade: number;
  dicasAbertas: number;
  minutosGastos: number;
  competencias: [number, number, number, number, number];
};

export type Progresso = {
  concluidas: number;
  iniciadas: number;
  taxaConclusao: number | null;
  xpTotal: number;
  notaMedia: number | null;
  melhorNota: number | null;
  minutosMedios: number | null;
  dicasPorPartida: number | null;
  /** Média de cada competência, índice 0 = C1. */
  mediaPorCompetencia: [number, number, number, number, number] | null;
  /**
   * Variação de cada competência entre a primeira e a última metade das
   * partidas. null quando há partidas insuficientes — melhor não dizer nada
   * que dizer errado com confiança.
   */
  tendenciaPorCompetencia: [number, number, number, number, number] | null;
  /** Índice 0-based da competência de menor média. null se não há dados. */
  competenciaMaisFraca: number | null;
};

const media = (xs: number[]) =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

export function calcularProgresso(
  partidas: PartidaConcluida[],
  iniciadas: number
): Progresso {
  const concluidas = partidas.length;

  if (concluidas === 0) {
    return {
      concluidas: 0,
      iniciadas,
      taxaConclusao: iniciadas > 0 ? 0 : null,
      xpTotal: 0,
      notaMedia: null,
      melhorNota: null,
      minutosMedios: null,
      dicasPorPartida: null,
      mediaPorCompetencia: null,
      tendenciaPorCompetencia: null,
      competenciaMaisFraca: null,
    };
  }

  // Mais antigas primeiro: a tendência depende da ordem.
  const ordenadas = [...partidas].sort(
    (a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm)
  );

  const porComp = (i: number) => ordenadas.map((p) => p.competencias[i]);

  const mediaPorCompetencia = [0, 1, 2, 3, 4].map(
    (i) => media(porComp(i))!
  ) as [number, number, number, number, number];

  let tendenciaPorCompetencia: Progresso["tendenciaPorCompetencia"] = null;
  if (concluidas >= MIN_PARTIDAS_PARA_TENDENCIA) {
    const meio = Math.floor(concluidas / 2);
    tendenciaPorCompetencia = [0, 1, 2, 3, 4].map((i) => {
      const antes = media(porComp(i).slice(0, meio))!;
      const depois = media(porComp(i).slice(concluidas - meio))!;
      return Math.round(depois - antes);
    }) as [number, number, number, number, number];
  }

  const menor = Math.min(...mediaPorCompetencia);

  return {
    concluidas,
    iniciadas,
    // Pode passar de 1 se houver partidas concluídas de antes de a contagem de
    // iniciadas existir; travar em 1 evita "112% de conclusão" na tela.
    taxaConclusao: iniciadas > 0 ? Math.min(1, concluidas / iniciadas) : null,
    xpTotal: ordenadas.reduce((s, p) => s + p.xpFinal, 0),
    notaMedia: media(ordenadas.map((p) => p.notaBruta)),
    melhorNota: Math.max(...ordenadas.map((p) => p.notaBruta)),
    minutosMedios: media(ordenadas.map((p) => p.minutosGastos)),
    dicasPorPartida: media(ordenadas.map((p) => p.dicasAbertas)),
    mediaPorCompetencia,
    tendenciaPorCompetencia,
    competenciaMaisFraca: mediaPorCompetencia.indexOf(menor),
  };
}
