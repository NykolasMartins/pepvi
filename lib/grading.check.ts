/**
 * Autoteste das regras de nota calculadas em código.
 *
 *   node lib/grading.check.ts
 *
 * Não testa o modelo — testa o que fazemos com a resposta dele. É aqui que mora
 * a regra do ENEM que não pode depender de o modelo "lembrar": contagem da C5,
 * tetos de profundidade e zeramento por fuga ao tema.
 */

import assert from "node:assert/strict";
import {
  scoreC5, ceilingC1, ceilingC2, ceilingC3, finalScores, NIVEIS,
  type C1Signals, type C2Signals, type C3Signals, type C5Flags, type Evaluation,
} from "./enem.ts";

const c5Vazio: C5Flags = {
  hasAgent: false, hasAction: false, hasMeans: false,
  hasPurpose: false, hasDetailing: false,
  agentIsSpecific: false, actionIsDetailed: false,
  violatesHumanRights: false, justification: "",
};

const c5Completo: C5Flags = {
  hasAgent: true, hasAction: true, hasMeans: true,
  hasPurpose: true, hasDetailing: true,
  agentIsSpecific: true, actionIsDetailed: true,
  violatesHumanRights: false, justification: "",
};

const c3Bom: C3Signals = {
  hasThesis: true, argumentsHaveCausalChain: true,
  reliesOnCommonSense: false, usesOnlyMotivatingTexts: false,
};

const c1Limpo: C1Signals = { oralityMarksCount: 0 };

const c2Proprio: C2Signals = {
  hasExternalRepertoire: true,
  usedPlatformHints: false,
  onlyFromMotivatingTexts: false,
  repertoireIsProductive: true,
  sourceNote: "",
};

// ==========================================================================
// C2 — trava de origem do repertório
//
// A matriz oficial coloca "repertório baseado nos textos motivadores" no nível
// 3. Parafrasear o enunciado não demonstra repertório sociocultural.
// ==========================================================================

// Repertório próprio e produtivo: sem teto.
assert.equal(ceilingC2(200, c2Proprio).score, 200);
assert.equal(ceilingC2(200, c2Proprio).motivo, undefined);

// Só os motivadores: trava em 120, venha o modelo com 160 ou 200.
const soMotivadores: C2Signals = {
  hasExternalRepertoire: false,
  usedPlatformHints: false,
  onlyFromMotivatingTexts: true,
  repertoireIsProductive: true,
  sourceNote: "",
};
assert.equal(ceilingC2(200, soMotivadores).score, 120, "200 com repertório do enunciado trava em 120");
assert.equal(ceilingC2(160, soMotivadores).score, 120, "160 também trava");
assert.match(ceilingC2(200, soMotivadores).motivo!, /textos motivadores/);

// Sem fonte qualificada nenhuma: mesma trava, ainda que não marque
// onlyFromMotivatingTexts.
assert.equal(
  ceilingC2(200, { ...soMotivadores, onlyFromMotivatingTexts: false }).score,
  120
);

// Dica da plataforma conta como fonte qualificada: 200 liberado.
const viaDica: C2Signals = {
  hasExternalRepertoire: false,
  usedPlatformHints: true,
  onlyFromMotivatingTexts: false,
  repertoireIsProductive: true,
  sourceNote: "",
};
assert.equal(ceilingC2(200, viaDica).score, 200, "dica usada produtivamente chega a 200");

// Mas dica citada e abandonada para em 160 — a fonte abre a porta, o uso é que
// dá a nota máxima.
assert.equal(
  ceilingC2(200, { ...viaDica, repertoireIsProductive: false }).score,
  160
);
assert.match(
  ceilingC2(200, { ...viaDica, repertoireIsProductive: false }).motivo!,
  /não usado para sustentar/
);

// Sinais contraditórios resolvem para o teto, não para a nota alta.
assert.equal(
  ceilingC2(200, { ...c2Proprio, onlyFromMotivatingTexts: true }).score,
  120,
  "na contradição, prevalece a trava"
);

// Teto nunca sobe nota: 80 com repertório próprio continua 80.
assert.equal(ceilingC2(80, c2Proprio).score, 80);
assert.equal(ceilingC2(40, soMotivadores).score, 40);

// ==========================================================================
// C5 — contagem por elemento
// ==========================================================================
assert.equal(scoreC5(c5Vazio).score, 0);
assert.equal(scoreC5({ ...c5Vazio, hasAgent: true }).score, 40);
assert.equal(scoreC5(c5Completo).score, 200);

// Violar direitos humanos zera, mesmo com os cinco elementos presentes.
assert.equal(scoreC5({ ...c5Completo, violatesHumanRights: true }).score, 0);

// ==========================================================================
// C5 — o caso que motivou a v2: 200 indevido
//
// "para salvar a floresta" era aceito como detalhamento e o agente era
// "o governo". Cinco elementos formalmente presentes, agente genérico.
// ==========================================================================
const propostaFraca = { ...c5Completo, agentIsSpecific: false };
assert.equal(scoreC5(propostaFraca).score, 160, "agente genérico não passa de 160");
assert.match(scoreC5(propostaFraca).motivo!, /genérico/);

const acaoVaga = { ...c5Completo, actionIsDetailed: false };
assert.equal(scoreC5(acaoVaga).score, 160, "ação sem detalhamento não passa de 160");
assert.match(scoreC5(acaoVaga).motivo!, /como se faz/);

// Os dois problemas juntos continuam em 160 e explicam os dois.
const ambos = { ...c5Completo, agentIsSpecific: false, actionIsDetailed: false };
assert.equal(scoreC5(ambos).score, 160);
assert.match(scoreC5(ambos).motivo!, /genérico e ação/);

// O teto não INFLA nota baixa: 3 elementos com agente genérico seguem 120.
assert.equal(
  scoreC5({ ...c5Vazio, hasAgent: true, hasAction: true, hasMeans: true }).score,
  120
);

// Só chega a 200 com agente nomeado E ação detalhada.
assert.equal(scoreC5(c5Completo).motivo, undefined);

// ==========================================================================
// C3 — o caso que motivou a v2: 160 para argumento de senso comum
// ==========================================================================
assert.equal(ceilingC3(160, c3Bom).score, 160, "argumento encadeado mantém a nota");

assert.equal(
  ceilingC3(160, { ...c3Bom, reliesOnCommonSense: true }).score,
  120,
  "senso comum trava em 120"
);
assert.equal(
  ceilingC3(200, { ...c3Bom, argumentsHaveCausalChain: false }).score,
  120,
  "afirmar sem explicar trava em 120"
);
assert.equal(
  ceilingC3(160, { ...c3Bom, usesOnlyMotivatingTexts: true }).score,
  120
);

// Sem tese é mais grave que argumento raso.
assert.equal(ceilingC3(200, { ...c3Bom, hasThesis: false }).score, 80);

// Teto nunca sobe nota: 80 com sinais bons continua 80.
assert.equal(ceilingC3(80, c3Bom).score, 80);
assert.equal(ceilingC3(40, { ...c3Bom, reliesOnCommonSense: true }).score, 40);

// Todo teto vem com motivo legível, para virar feedback na tela.
assert.ok(ceilingC3(160, { ...c3Bom, reliesOnCommonSense: true }).motivo);

// ==========================================================================
// C1 — marcas de oralidade
// ==========================================================================
assert.equal(ceilingC1(200, c1Limpo).score, 200, "texto sem oralidade mantém 200");
assert.equal(ceilingC1(200, { oralityMarksCount: 1 }).score, 160);
assert.equal(ceilingC1(200, { oralityMarksCount: 2 }).score, 120);
assert.equal(ceilingC1(160, { oralityMarksCount: 3 }).score, 120);
assert.equal(ceilingC1(200, { oralityMarksCount: 4 }).score, 80);
assert.equal(ceilingC1(200, { oralityMarksCount: 12 }).score, 80);

// O caso testado: "a gente" e "destruir ela" = 2 marcas, teto 120.
assert.equal(ceilingC1(160, { oralityMarksCount: 2 }).score, 120);

// Teto não sobe nota.
assert.equal(ceilingC1(40, c1Limpo).score, 40);
assert.equal(ceilingC1(80, { oralityMarksCount: 1 }).score, 80);

// ==========================================================================
// finalScores — integração
// ==========================================================================
const bom: Evaluation = {
  competencies: [
    { id: 1, score: 160, justification: "", evidence: [] },
    { id: 2, score: 200, justification: "", evidence: [] },
    { id: 3, score: 160, justification: "", evidence: [] },
    { id: 4, score: 120, justification: "", evidence: [] },
  ],
  c1: c1Limpo,
  c2: c2Proprio,
  c3: c3Bom,
  c5: { ...c5Vazio, hasAgent: true, hasAction: true, hasMeans: true,
        agentIsSpecific: true, actionIsDetailed: true },
  escapesTheme: false,
  isDisconnected: false,
  generalFeedback: "",
  topPriority: "",
};

const r0 = finalScores(bom);
assert.deepEqual([r0.c1, r0.c2, r0.c3, r0.c4, r0.c5], [160, 200, 160, 120, 120]);
assert.deepEqual(r0.ceilings, {}, "sem teto aplicado, nenhum motivo");

// A redação testada: C1 com 2 marcas, C3 raso, C5 com agente genérico.
// A C2 veio de dica usada produtivamente, então mantém 200.
const medianaComFalhas: Evaluation = {
  ...bom,
  c1: { oralityMarksCount: 2 },
  c2: viaDica,
  c3: { ...c3Bom, reliesOnCommonSense: true },
  c5: { ...c5Completo, agentIsSpecific: false },
};
const r1 = finalScores(medianaComFalhas);
assert.deepEqual([r1.c1, r1.c2, r1.c3, r1.c4, r1.c5], [120, 200, 120, 120, 160]);
assert.ok(
  r1.ceilings.c1 && r1.ceilings.c3 && r1.ceilings.c5,
  "os três tetos precisam explicar por que baixaram"
);
assert.equal(r1.ceilings.c2, undefined, "C2 via dica produtiva não leva teto");

// Na v1 esse texto somava 840. Na v3 soma 720.
assert.equal(r1.c1 + r1.c2 + r1.c3 + r1.c4 + r1.c5, 720);

// O mesmo texto, mas com repertório só do enunciado: a C2 cai de 200 para 120.
const semRepertorioProprio = finalScores({ ...medianaComFalhas, c2: soMotivadores });
assert.equal(semRepertorioProprio.c2, 120);
assert.ok(semRepertorioProprio.ceilings.c2);
assert.equal(
  semRepertorioProprio.c1 + semRepertorioProprio.c2 + semRepertorioProprio.c3 +
  semRepertorioProprio.c4 + semRepertorioProprio.c5,
  640
);

// Fuga ao tema zera tudo, por bom que seja o resto.
assert.deepEqual(finalScores({ ...bom, escapesTheme: true }), {
  c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, zeroed: true, ceilings: {},
});
assert.equal(finalScores({ ...bom, isDisconnected: true }).zeroed, true);

// Competência ausente na resposta conta 0, não undefined nem NaN.
const faltando = finalScores({ ...bom, competencies: [bom.competencies[0]] });
assert.equal(faltando.c2, 0);
assert.equal(faltando.c4, 0);

// Toda nota final é um nível válido do ENEM, e o total cabe em 0..1000.
for (const ev of [bom, medianaComFalhas, { ...bom, escapesTheme: true }]) {
  const f = finalScores(ev);
  for (const n of [f.c1, f.c2, f.c3, f.c4, f.c5]) {
    assert.ok(NIVEIS.includes(n as (typeof NIVEIS)[number]), `nota inválida: ${n}`);
  }
  const total = f.c1 + f.c2 + f.c3 + f.c4 + f.c5;
  assert.ok(total >= 0 && total <= 1000, `total fora de faixa: ${total}`);
}

console.log("grading: autoteste OK");

// ==========================================================================
// Status efetivo derivado na leitura
// ==========================================================================

const { effectiveStatus, GRADING_TIMEOUT_MS } = await import("./matchStatus.ts");

const T0 = Date.parse("2026-08-25T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

assert.equal(
  effectiveStatus({ status: "in_progress", deadline: iso(T0 + 60_000), submitted_at: null }, T0),
  "in_progress"
);

// Prazo vencido vira expired sem ninguém escrever no banco.
assert.equal(
  effectiveStatus({ status: "in_progress", deadline: iso(T0 - 1), submitted_at: null }, T0),
  "expired"
);

assert.equal(
  effectiveStatus({ status: "grading", deadline: iso(T0 - 60_000), submitted_at: iso(T0 - 30_000) }, T0),
  "grading"
);

// Correção parada há mais de 15 min é falha, não espera eterna.
assert.equal(
  effectiveStatus(
    { status: "grading", deadline: iso(T0 - 3_600_000), submitted_at: iso(T0 - GRADING_TIMEOUT_MS - 1000) },
    T0
  ),
  "grading_failed"
);

// grading sem submitted_at não vira grading_failed por comparação com nada.
assert.equal(
  effectiveStatus({ status: "grading", deadline: iso(T0 - 60_000), submitted_at: null }, T0),
  "grading"
);

// Estados terminais nunca são reescritos, mesmo com prazo vencido há muito.
for (const s of ["graded", "expired", "cancelled", "needs_reupload", "grading_failed"] as const) {
  assert.equal(
    effectiveStatus({ status: s, deadline: iso(T0 - 9_999_999), submitted_at: iso(T0 - 9_999_999) }, T0),
    s,
    `status terminal ${s} foi reescrito`
  );
}

console.log("matchStatus: autoteste OK");

// ==========================================================================
// Elegibilidade a XP vem de elapsed_seconds, não do status
// ==========================================================================

const { isLate, SUBMIT_GRACE_SECONDS } = await import("./matchStatus.ts");

const D = 5400; // 90 min

assert.equal(isLate({ elapsed_seconds: 3600, duration_seconds: D }), false);
// Estourou o prazo mas dentro da carência: NÃO é atraso.
assert.equal(isLate({ elapsed_seconds: D + 1, duration_seconds: D }), false);
assert.equal(isLate({ elapsed_seconds: D + SUBMIT_GRACE_SECONDS, duration_seconds: D }), false);
// Um segundo além da carência: atraso.
assert.equal(isLate({ elapsed_seconds: D + SUBMIT_GRACE_SECONDS + 1, duration_seconds: D }), true);
// Nunca enviada não conta como atraso.
assert.equal(isLate({ elapsed_seconds: null, duration_seconds: D }), false);
assert.equal(isLate({ elapsed_seconds: 0, duration_seconds: D }), false);

console.log("isLate: autoteste OK");

// ==========================================================================
// Agregação do progresso
// ==========================================================================

const { calcularProgresso, MIN_PARTIDAS_PARA_TENDENCIA } = await import("./stats.ts");

type P = Parameters<typeof calcularProgresso>[0][number];

function partida(over: Partial<P> = {}): P {
  return {
    id: crypto.randomUUID(),
    temaTitulo: "tema",
    criadaEm: "2026-08-01T12:00:00Z",
    status: "graded",
    expirada: false,
    isReplay: false,
    origem: "handwritten",
    notaBruta: 600,
    xpFinal: 700,
    penalidadeDicas: 0,
    bonusVelocidade: 100,
    dicasAbertas: 0,
    minutosGastos: 60,
    competencias: [120, 120, 120, 120, 120],
    ...over,
  };
}

// Sem partidas: nada de NaN nem de divisão por zero.
const vazio = calcularProgresso([], 0);
assert.equal(vazio.concluidas, 0);
assert.equal(vazio.xpTotal, 0);
assert.equal(vazio.notaMedia, null);
assert.equal(vazio.melhorNota, null);
assert.equal(vazio.mediaPorCompetencia, null);
assert.equal(vazio.competenciaMaisFraca, null);
assert.equal(vazio.taxaConclusao, null, "sem partida iniciada, taxa é indefinida e não 0/0");

// Iniciou e não concluiu nenhuma: taxa é 0, não null.
assert.equal(calcularProgresso([], 3).taxaConclusao, 0);

const duas = calcularProgresso(
  [
    partida({ notaBruta: 400, xpFinal: 400, minutosGastos: 40, dicasAbertas: 2 }),
    partida({ notaBruta: 800, xpFinal: 900, minutosGastos: 80, dicasAbertas: 0 }),
  ],
  2
);
assert.equal(duas.notaMedia, 600);
assert.equal(duas.melhorNota, 800);
assert.equal(duas.xpTotal, 1300);
assert.equal(duas.minutosMedios, 60);
assert.equal(duas.dicasPorPartida, 1);
assert.equal(duas.taxaConclusao, 1);

const desigual = calcularProgresso([partida({ competencias: [200, 160, 40, 120, 80] })], 1);
assert.equal(desigual.competenciaMaisFraca, 2, "C3 é a mais fraca (índice 2)");
assert.deepEqual(desigual.mediaPorCompetencia, [200, 160, 40, 120, 80]);

// Tendência: silêncio quando os dados não bastam.
for (let n = 1; n < MIN_PARTIDAS_PARA_TENDENCIA; n++) {
  const r = calcularProgresso(Array.from({ length: n }, () => partida()), n);
  assert.equal(r.tendenciaPorCompetencia, null, `com ${n} partida(s) não se afirma tendência`);
}

const evoluindo = calcularProgresso(
  [
    partida({ criadaEm: "2026-08-01T12:00:00Z", competencias: [80, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-02T12:00:00Z", competencias: [80, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-03T12:00:00Z", competencias: [160, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-04T12:00:00Z", competencias: [160, 120, 120, 120, 120] }),
  ],
  4
);
assert.deepEqual(evoluindo.tendenciaPorCompetencia, [80, 0, 0, 0, 0]);

// A ordem cronológica manda, não a ordem do array.
const embaralhado = calcularProgresso(
  [
    partida({ criadaEm: "2026-08-04T12:00:00Z", competencias: [160, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-01T12:00:00Z", competencias: [80, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-03T12:00:00Z", competencias: [160, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-02T12:00:00Z", competencias: [80, 120, 120, 120, 120] }),
  ],
  4
);
assert.deepEqual(embaralhado.tendenciaPorCompetencia, [80, 0, 0, 0, 0]);

// Piora aparece como número negativo, não como zero otimista.
const piorando = calcularProgresso(
  [
    partida({ criadaEm: "2026-08-01T12:00:00Z", competencias: [200, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-02T12:00:00Z", competencias: [200, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-03T12:00:00Z", competencias: [40, 120, 120, 120, 120] }),
    partida({ criadaEm: "2026-08-04T12:00:00Z", competencias: [40, 120, 120, 120, 120] }),
  ],
  4
);
assert.equal(piorando.tendenciaPorCompetencia![0], -160);

// Taxa de conclusão nunca passa de 100%, mesmo com dado inconsistente.
assert.equal(calcularProgresso([partida(), partida()], 1).taxaConclusao, 1);

console.log("stats: autoteste OK");
