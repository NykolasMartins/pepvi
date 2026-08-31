/**
 * Cálculo de XP (PRD 4.9).
 *
 * Toda constante vive aqui e a versão vai gravada em cada partida:
 * balanceamento de jogo se ajusta em produção, e partidas antigas precisam
 * continuar explicáveis.
 *
 * A IA nunca toca nada disto. Ela devolve a nota bruta das 5 competências; o
 * resto é aritmética determinística.
 *
 * Autoteste: `node lib/scoring.check.ts`
 */

export const SCORING = {
  version: "v1",
  defaultHintCost: 25,    // preço padrão da dica; hints.cost_xp pode diferir
  maxHints: 5,
  speedBonusFactor: 0.30, // teto de 30% da nota líquida
  speedRatioCap: 0.70,    // piso de tempo — ver abaixo
  minScoreForBonus: 500,  // trava anti-speedrun — ver abaixo
  replayMultiplier: 0.5,  // pool de temas esgotado (PRD 4.6)
};

export type XpInput = {
  rawScore: number;        // 0..1000, soma das 5 competências
  /**
   * Penalidade JÁ SOMADA dos snapshots em match_hints, não a contagem de dicas.
   *
   * Cada dica guarda o próprio cost_xp no momento da abertura, então
   * `dicas × 25` estaria errado assim que existisse uma dica de preço
   * diferente — e rebalancear o preço reescreveria partidas antigas.
   */
  hintPenalty: number;
  elapsedSeconds: number;
  durationSeconds: number;
  expired: boolean;
  isReplay?: boolean;
  /**
   * Multiplicador da dificuldade (tabela difficulties).
   *
   * Existe porque o bônus de velocidade é RELATIVO à duração: terminar em 45
   * de 60 min rende ratio 0,25, contra 0,50 em 45 de 90. Sem multiplicador, a
   * dificuldade maior pagaria MENOS — incentivo invertido.
   */
  difficultyMultiplier?: number;
  /**
   * Treino livre: o jogador escolheu tema e relógio, então nada aqui pontua.
   *
   * A trava é redundante — iniciar_partida marca is_free e xp_total já exclui
   * essas partidas — e é de propósito. O XP nasce nesta função; deixar a
   * proteção só na consulta significa que qualquer leitura futura que esqueça
   * o `and not is_free` passa a pagar por um tempo que o próprio jogador
   * definiu.
   */
  isFree?: boolean;
};

export type XpResult = {
  penalty: number;
  speedBonus: number;
  xpFinal: number;
  scoringVersion: string;
};

export function computeXp({
  rawScore,
  hintPenalty,
  elapsedSeconds,
  durationSeconds,
  expired,
  isReplay = false,
  difficultyMultiplier = 1,
  isFree = false,
}: XpInput): XpResult {
  if (isFree || expired) {
    return { penalty: 0, speedBonus: 0, xpFinal: 0, scoringVersion: SCORING.version };
  }

  const penalty = Math.max(0, hintPenalty);
  const net = Math.max(0, rawScore - penalty);

  const remainingRatio = Math.max(
    0,
    (durationSeconds - elapsedSeconds) / durationSeconds
  );

  // Piso de tempo: corresponde a exigir ~30% do relógio para acessar o bônus
  // máximo. Sem o teto, terminar em 10 min renderia multiplicador absurdo e o
  // incentivo passaria a ser correr contra a qualidade.
  const cappedRatio = Math.min(remainingRatio, SCORING.speedRatioCap);

  // Trava anti-speedrun: sem ela a estratégia ótima é fotografar folha em
  // branco aos 2 minutos e colher o multiplicador máximo. Velocidade
  // recompensa quem escreve bem rápido, não quem desiste rápido.
  const speedBonus =
    rawScore >= SCORING.minScoreForBonus
      ? Math.round(net * SCORING.speedBonusFactor * cappedRatio)
      : 0;

  // Dificuldade primeiro, repetição depois: a repetição é desconto sobre o que
  // a partida valeria, e o que ela vale já inclui a dificuldade.
  const comDificuldade = (net + speedBonus) * Math.max(0, difficultyMultiplier);
  const xpFinal = Math.round(
    isReplay ? comDificuldade * SCORING.replayMultiplier : comDificuldade
  );

  return { penalty, speedBonus, xpFinal, scoringVersion: SCORING.version };
}
