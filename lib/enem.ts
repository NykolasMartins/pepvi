/**
 * Regras de nota do ENEM. Zero dependências — nem do provedor de IA, nem do
 * banco. É o módulo que o autoteste roda direto no Node, e é aqui que mora
 * tudo que NÃO pode depender de o modelo "lembrar" da regra.
 *
 * Princípio: o modelo reporta EVIDÊNCIA (booleanos, contagens, trechos); o
 * código aplica o TETO. Pedir a nota direto produz oscilação e generosidade —
 * o modelo enxerga uma estrutura básica presente e premia como se fosse
 * profundidade.
 *
 * Autoteste: `node lib/grading.check.ts`
 */

/** Níveis válidos do ENEM. Nenhum outro valor pode chegar ao banco. */
export const NIVEIS = [0, 40, 80, 120, 160, 200] as const;

export type C1Signals = {
  /** Quantas marcas de oralidade distintas ("a gente", "pra", "destruir ela"). */
  oralityMarksCount: number;
};

export type C2Signals = {
  /** Repertório legitimado que NÃO está nos textos motivadores nem nas dicas. */
  hasExternalRepertoire: boolean;
  /** O texto usa conteúdo de alguma dica que o aluno abriu na plataforma. */
  usedPlatformHints: boolean;
  /** Todo o repertório é cópia ou paráfrase dos textos motivadores. */
  onlyFromMotivatingTexts: boolean;
  /** O repertório sustenta o argumento, em vez de ser citado e abandonado. */
  repertoireIsProductive: boolean;
  /** De onde veio o repertório, em uma frase. Vira feedback. */
  sourceNote: string;
};

export type C3Signals = {
  /** Existe tese explícita na introdução? */
  hasThesis: boolean;
  /** Os parágrafos explicam o encadeamento causa → mecanismo → consequência? */
  argumentsHaveCausalChain: boolean;
  /** Recorre a senso comum e generalização ("o governo não fiscaliza direito")? */
  reliesOnCommonSense: boolean;
  /** O repertório se limita ao que os textos motivadores já traziam? */
  usesOnlyMotivatingTexts: boolean;
};

export type C5Flags = {
  hasAgent: boolean;
  hasAction: boolean;
  hasMeans: boolean;
  hasPurpose: boolean;
  hasDetailing: boolean;
  /** Agente nomeado (IBAMA, MEC), não "o governo" ou "a sociedade". */
  agentIsSpecific: boolean;
  /** A ação diz COMO se faz, não só o que se quer que aconteça. */
  actionIsDetailed: boolean;
  violatesHumanRights: boolean;
  justification: string;
};

export type Competency = {
  id: number;
  score: number;
  justification: string;
  evidence: string[];
};

export type Evaluation = {
  competencies: Competency[];
  c1: C1Signals;
  c2: C2Signals;
  c3: C3Signals;
  c5: C5Flags;
  escapesTheme: boolean;
  isDisconnected: boolean;
  generalFeedback: string;
  topPriority: string;
};

export type FinalScores = {
  c1: number; c2: number; c3: number; c4: number; c5: number;
  zeroed: boolean;
  /** Por que cada teto foi aplicado. Vira feedback na tela. */
  ceilings: { c1?: string; c2?: string; c3?: string; c5?: string };
};

const teto = (nota: number, limite: number) => Math.min(nota, limite);

/**
 * C1 — marcas de oralidade derrubam o teto proporcionalmente.
 *
 * "a gente", "pra", "destruir ela" não são deslizes menores: são registro
 * inadequado, que é exatamente o que a competência mede. Uma ocorrência isolada
 * ainda admite 160; a partir de duas, o domínio já não é "poucos desvios".
 */
export function ceilingC1(score: number, s: C1Signals): { score: number; motivo?: string } {
  const n = s.oralityMarksCount;
  if (n >= 4) return { score: teto(score, 80), motivo: `${n} marcas de oralidade` };
  if (n >= 2) return { score: teto(score, 120), motivo: `${n} marcas de oralidade` };
  if (n === 1) return { score: teto(score, 160), motivo: "1 marca de oralidade" };
  return { score };
}

/**
 * C2 — repertório só dos textos motivadores não passa de 120.
 *
 * É a matriz oficial: o nível 3 é literalmente "argumentação previsível,
 * repertório baseado nos textos motivadores". Parafrasear o enunciado não
 * demonstra repertório sociocultural — demonstra leitura do enunciado.
 *
 * Para 160 ou 200 é preciso fonte qualificada: repertório próprio do aluno OU
 * conteúdo das dicas que ele abriu (e pagou em XP). A banca não pergunta de
 * onde o aluno tirou a referência; pergunta se ela é legitimada, pertinente e
 * produtiva. Dica usada produtivamente satisfaz os três.
 *
 * Sinais contraditórios do modelo (externo=true e onlyFromMotivating=true)
 * resolvem para o teto: entre errar para cima e para baixo numa nota, errar
 * para baixo é recuperável — o aluno reclama e a gente confere.
 */
export function ceilingC2(score: number, s: C2Signals): { score: number; motivo?: string } {
  const fonteQualificada = s.hasExternalRepertoire || s.usedPlatformHints;

  if (!fonteQualificada || s.onlyFromMotivatingTexts) {
    return {
      score: teto(score, 120),
      motivo: "repertório apenas dos textos motivadores — traga referência própria ou use as dicas",
    };
  }

  if (!s.repertoireIsProductive) {
    return {
      score: teto(score, 160),
      motivo: "repertório citado, mas não usado para sustentar o argumento",
    };
  }

  return { score };
}

/**
 * C3 — argumento raso não passa de 120.
 *
 * O modelo tende a pontuar a PRESENÇA de argumentos, não a profundidade deles.
 * "prejudicando os animais" e "o governo não fiscaliza direito" são afirmações
 * sem mecanismo: não explicam por que, nem como, nem com que consequência.
 * Sem tese explícita a coisa é mais grave — não há ponto de vista a defender.
 */
export function ceilingC3(score: number, s: C3Signals): { score: number; motivo?: string } {
  if (!s.hasThesis) {
    return { score: teto(score, 80), motivo: "sem tese explícita na introdução" };
  }
  if (s.reliesOnCommonSense) {
    return { score: teto(score, 120), motivo: "argumentos apoiados em senso comum e generalização" };
  }
  if (!s.argumentsHaveCausalChain) {
    return { score: teto(score, 120), motivo: "argumentos afirmam sem explicar o encadeamento lógico" };
  }
  if (s.usesOnlyMotivatingTexts) {
    return { score: teto(score, 120), motivo: "repertório limitado aos textos motivadores" };
  }
  return { score };
}

/**
 * C5 — 40 por elemento presente, com teto de 160 sem agente e ação concretos.
 *
 * Contar elementos é estável, mas contar mal é pior que não contar: o modelo
 * aceitava a FINALIDADE no lugar do DETALHAMENTO ("para salvar a floresta") e
 * dava 200. Os dois sinais extras existem para fechar isso — nota máxima exige
 * agente nomeado e ação que diga como se faz.
 */
export function scoreC5(f: C5Flags): { score: number; motivo?: string } {
  if (f.violatesHumanRights) {
    return { score: 0, motivo: "proposta fere os direitos humanos" };
  }

  const presentes = [f.hasAgent, f.hasAction, f.hasMeans, f.hasPurpose, f.hasDetailing];
  const base = presentes.filter(Boolean).length * 40;

  if (!f.agentIsSpecific && !f.actionIsDetailed) {
    return { score: teto(base, 160), motivo: "agente genérico e ação sem detalhamento" };
  }
  if (!f.agentIsSpecific) {
    return { score: teto(base, 160), motivo: "agente genérico — nomeie quem executa" };
  }
  if (!f.actionIsDetailed) {
    return { score: teto(base, 160), motivo: "ação sem detalhamento — diga como se faz" };
  }
  return { score: base };
}

/**
 * Fuga ao tema e texto não-dissertativo zeram a redação inteira. A regra é
 * aplicada aqui, a partir do booleano — não se pede ao modelo que "lembre de
 * zerar".
 */
export function finalScores(ev: Evaluation): FinalScores {
  if (ev.escapesTheme || ev.isDisconnected) {
    return { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, zeroed: true, ceilings: {} };
  }

  // Competência ausente na resposta conta 0 — nunca undefined ou NaN chegando
  // no banco como nota.
  const byId = (id: number) => ev.competencies.find((c) => c.id === id)?.score ?? 0;

  const c1 = ceilingC1(byId(1), ev.c1);
  const c2 = ceilingC2(byId(2), ev.c2);
  const c3 = ceilingC3(byId(3), ev.c3);
  const c5 = scoreC5(ev.c5);

  return {
    c1: c1.score,
    c2: c2.score,
    c3: c3.score,
    c4: byId(4),
    c5: c5.score,
    zeroed: false,
    ceilings: {
      ...(c1.motivo ? { c1: c1.motivo } : {}),
      ...(c2.motivo ? { c2: c2.motivo } : {}),
      ...(c3.motivo ? { c3: c3.motivo } : {}),
      ...(c5.motivo ? { c5: c5.motivo } : {}),
    },
  };
}
