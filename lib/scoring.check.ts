/**
 * Autoteste do cálculo de XP. Sem framework.
 *
 *   node lib/scoring.check.ts
 *
 * Existe porque isto é aritmética que decide pontuação: um erro aqui não lança
 * exceção nenhuma, só distribui XP errado por semanas.
 */

import assert from "node:assert/strict";
import { computeXp, SCORING } from "./scoring.ts";

const D = 5400; // 90 min
const min = (n: number) => n * 60;

// --- tabela de exemplos do PRD 4.9 -----------------------------------------

// 880, sem dicas, 60 min: sobra 1/3 do relógio
assert.deepEqual(
  computeXp({ rawScore: 880, hintPenalty: 0, elapsedSeconds: min(60), durationSeconds: D, expired: false }),
  { penalty: 0, speedBonus: 88, xpFinal: 968, scoringVersion: "v1" }
);

// mesma partida com 2 dicas a 25 cada: -50 de penalidade, e o bônus cai porque incide
// sobre a nota líquida
assert.deepEqual(
  computeXp({ rawScore: 880, hintPenalty: 50, elapsedSeconds: min(60), durationSeconds: D, expired: false }),
  { penalty: 50, speedBonus: 83, xpFinal: 913, scoringVersion: "v1" }
);

// entregou aos 89 min: bônus praticamente zero
assert.deepEqual(
  computeXp({ rawScore: 880, hintPenalty: 0, elapsedSeconds: min(89), durationSeconds: D, expired: false }),
  { penalty: 0, speedBonus: 3, xpFinal: 883, scoringVersion: "v1" }
);

// nota abaixo da trava (3 dicas = 75): rápido, mas sem bônus
assert.deepEqual(
  computeXp({ rawScore: 420, hintPenalty: 75, elapsedSeconds: min(25), durationSeconds: D, expired: false }),
  { penalty: 75, speedBonus: 0, xpFinal: 345, scoringVersion: "v1" }
);

assert.deepEqual(
  computeXp({ rawScore: 700, hintPenalty: 25, elapsedSeconds: min(30), durationSeconds: D, expired: false }),
  { penalty: 25, speedBonus: 135, xpFinal: 810, scoringVersion: "v1" }
);

// expirada: corrige para dar feedback, mas não paga XP
assert.deepEqual(
  computeXp({ rawScore: 900, hintPenalty: 0, elapsedSeconds: min(95), durationSeconds: D, expired: true }),
  { penalty: 0, speedBonus: 0, xpFinal: 0, scoringVersion: "v1" }
);

// --- as duas travas --------------------------------------------------------

// Anti-speedrun: folha em branco aos 2 min não colhe multiplicador nenhum.
assert.equal(
  computeXp({ rawScore: 0, hintPenalty: 0, elapsedSeconds: min(2), durationSeconds: D, expired: false }).speedBonus,
  0
);
// Logo abaixo do corte: nada. Exatamente no corte: paga.
assert.equal(
  computeXp({ rawScore: 499, hintPenalty: 0, elapsedSeconds: min(30), durationSeconds: D, expired: false }).speedBonus,
  0
);
assert.ok(
  computeXp({ rawScore: 500, hintPenalty: 0, elapsedSeconds: min(30), durationSeconds: D, expired: false }).speedBonus > 0
);

// Piso de tempo: entregar aos 5 min não rende mais que entregar aos 27 min.
const at5 = computeXp({ rawScore: 1000, hintPenalty: 0, elapsedSeconds: min(5), durationSeconds: D, expired: false });
const at27 = computeXp({ rawScore: 1000, hintPenalty: 0, elapsedSeconds: min(27), durationSeconds: D, expired: false });
assert.equal(at5.speedBonus, at27.speedBonus);

// Teto prático de XP: 1000 + 1000*0,30*0,70
assert.equal(at5.xpFinal, 1210);

// --- bordas ---------------------------------------------------------------

// Penalidade maior que a nota não gera XP negativo.
assert.equal(
  computeXp({ rawScore: 80, hintPenalty: 125, elapsedSeconds: min(40), durationSeconds: D, expired: false }).xpFinal,
  0
);

// Entrega depois do prazo sem status expired: ratio trava em 0, sem bônus.
assert.equal(
  computeXp({ rawScore: 900, hintPenalty: 0, elapsedSeconds: min(95), durationSeconds: D, expired: false }).speedBonus,
  0
);

// Repetição de tema vale metade.
const normal = computeXp({ rawScore: 800, hintPenalty: 0, elapsedSeconds: min(45), durationSeconds: D, expired: false });
const replay = computeXp({ rawScore: 800, hintPenalty: 0, elapsedSeconds: min(45), durationSeconds: D, expired: false, isReplay: true });
assert.equal(replay.xpFinal, Math.round(normal.xpFinal * SCORING.replayMultiplier));

// Nota máxima com o relógio quase zerado ainda passa da nota bruta.
assert.ok(
  computeXp({ rawScore: 1000, hintPenalty: 0, elapsedSeconds: D, durationSeconds: D, expired: false }).xpFinal >= 1000
);

console.log("scoring: autoteste OK");

// --- penalidade agora vem somada, então preço por dica pode variar ----------

// A penalidade passa direto, sem multiplicar por preço nenhum: uma dica de 100
// custa igual a quatro de 25. É isto que permite dica com preço diferente.
assert.equal(
  computeXp({ rawScore: 800, hintPenalty: 100, elapsedSeconds: min(45), durationSeconds: D, expired: false }).penalty,
  100
);
assert.equal(
  computeXp({ rawScore: 800, hintPenalty: 4 * SCORING.defaultHintCost, elapsedSeconds: min(45), durationSeconds: D, expired: false }).xpFinal,
  computeXp({ rawScore: 800, hintPenalty: 100, elapsedSeconds: min(45), durationSeconds: D, expired: false }).xpFinal
);

// Penalidade negativa (dado corrompido) não pode virar bônus.
assert.equal(
  computeXp({ rawScore: 600, hintPenalty: -500, elapsedSeconds: min(45), durationSeconds: D, expired: false }).penalty,
  0
);

// Sem dicas: penalidade zero e bônus intacto.
const semDica = computeXp({ rawScore: 800, hintPenalty: 0, elapsedSeconds: min(45), durationSeconds: D, expired: false });
assert.equal(semDica.penalty, 0);
assert.ok(semDica.speedBonus > 0);

console.log("penalidade de dicas: autoteste OK");

// --- multiplicador de dificuldade ------------------------------------------

const base60 = { rawScore: 800, hintPenalty: 0, durationSeconds: 3600, expired: false };

// Sem multiplicador, a dificuldade maior pagaria MENOS: em 45 de 60 min sobra
// 25% do relógio, contra 50% em 45 de 90. É o incentivo invertido que o
// multiplicador existe para corrigir.
const rapidoSemMult = computeXp({ ...base60, elapsedSeconds: 45 * 60 });
const padraoMesmoTempo = computeXp({
  rawScore: 800, hintPenalty: 0, elapsedSeconds: 45 * 60,
  durationSeconds: 5400, expired: false,
});
assert.ok(
  rapidoSemMult.xpFinal < padraoMesmoTempo.xpFinal,
  "sem multiplicador o modo rápido paga menos — é por isso que ele existe"
);

// Com 1,25 o modo rápido passa a compensar.
const rapidoComMult = computeXp({ ...base60, elapsedSeconds: 45 * 60, difficultyMultiplier: 1.25 });
assert.ok(
  rapidoComMult.xpFinal > padraoMesmoTempo.xpFinal,
  "com multiplicador, terminar rápido num prazo apertado rende mais"
);

// Multiplicador 1 é idêntico a não passar nada.
assert.deepEqual(
  computeXp({ ...base60, elapsedSeconds: 1800, difficultyMultiplier: 1 }),
  computeXp({ ...base60, elapsedSeconds: 1800 })
);

// Escala exata: 1,6 sobre a mesma partida.
const semMult = computeXp({ ...base60, elapsedSeconds: 1800 });
const com16 = computeXp({ ...base60, elapsedSeconds: 1800, difficultyMultiplier: 1.6 });
assert.equal(com16.xpFinal, Math.round(semMult.xpFinal * 1.6));

// Ordem importa: dificuldade primeiro, repetição depois.
const dificilRepetido = computeXp({
  ...base60, elapsedSeconds: 1800, difficultyMultiplier: 1.6, isReplay: true,
});
assert.equal(dificilRepetido.xpFinal, Math.round(semMult.xpFinal * 1.6 * 0.5));

// Partida expirada não ganha nada, por mais difícil que seja.
assert.equal(
  computeXp({ ...base60, elapsedSeconds: 9999, expired: true, difficultyMultiplier: 1.6 }).xpFinal,
  0
);

// Multiplicador negativo (dado corrompido) não vira XP negativo.
assert.equal(
  computeXp({ ...base60, elapsedSeconds: 1800, difficultyMultiplier: -3 }).xpFinal,
  0
);

console.log("dificuldade: autoteste OK");
