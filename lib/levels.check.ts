/**
 * Autoteste dos níveis.
 *
 *   node lib/levels.check.ts
 *
 * A armadilha aqui é a borda: no último nível não existe "próximo", e código
 * que assume que existe divide por undefined e imprime NaN na tela sem lançar
 * exceção nenhuma.
 */

import assert from "node:assert/strict";
import { nivelDe, NIVEIS } from "./levels.ts";

// --- a tabela em si -------------------------------------------------------
assert.equal(NIVEIS[0].xpMinimo, 0, "o primeiro nível começa em zero");
for (let i = 1; i < NIVEIS.length; i++) {
  assert.ok(
    NIVEIS[i].xpMinimo > NIVEIS[i - 1].xpMinimo,
    `nível ${i + 1} precisa exigir mais XP que o anterior`
  );
  assert.equal(NIVEIS[i].numero, i + 1, "numeração precisa acompanhar a ordem");
}

// --- início ---------------------------------------------------------------
const zero = nivelDe(0);
assert.equal(zero.atual.numero, 1);
assert.equal(zero.xpNoNivel, 0);
assert.equal(zero.fracao, 0);
assert.equal(zero.proximo!.numero, 2);
assert.equal(zero.xpParaProximo, NIVEIS[1].xpMinimo);

// --- exatamente no limiar: já é o nível novo, não o anterior --------------
const naVirada = nivelDe(NIVEIS[1].xpMinimo);
assert.equal(naVirada.atual.numero, 2, "atingir o mínimo já promove");
assert.equal(naVirada.xpNoNivel, 0);
assert.equal(naVirada.fracao, 0);

// Um XP antes do limiar ainda é o nível anterior.
assert.equal(nivelDe(NIVEIS[1].xpMinimo - 1).atual.numero, 1);

// --- meio do caminho ------------------------------------------------------
const meio = nivelDe((NIVEIS[1].xpMinimo + NIVEIS[2].xpMinimo) / 2);
assert.equal(meio.atual.numero, 2);
assert.ok(meio.fracao > 0.49 && meio.fracao < 0.51, `fração fora do meio: ${meio.fracao}`);

// --- último nível: não existe próximo ------------------------------------
const ultimo = NIVEIS[NIVEIS.length - 1];
const topo = nivelDe(ultimo.xpMinimo);
assert.equal(topo.atual.numero, ultimo.numero);
assert.equal(topo.proximo, null, "no último nível não há próximo");
assert.equal(topo.xpParaProximo, null, "e não há XP faltando para lugar nenhum");
assert.equal(topo.fracao, 1);

// XP muito acima do topo continua no topo, sem estourar nada.
const muitoAlto = nivelDe(ultimo.xpMinimo * 100);
assert.equal(muitoAlto.atual.numero, ultimo.numero);
assert.equal(muitoAlto.fracao, 1);
assert.equal(muitoAlto.proximo, null);

// --- dado ruim não quebra a tela -----------------------------------------
assert.equal(nivelDe(-5000).atual.numero, 1, "XP negativo cai no nível 1");
assert.equal(nivelDe(-5000).fracao, 0);
assert.equal(nivelDe(1234.9).atual.numero, nivelDe(1234).atual.numero, "fracionário arredonda para baixo");

// --- a fração nunca sai de 0..1 e nunca é NaN ----------------------------
for (const xp of [0, 1, 999, 1000, 2499, 2500, 12_345, 25_000, 999_999, -1]) {
  const n = nivelDe(xp);
  assert.ok(Number.isFinite(n.fracao), `fração NaN em xp=${xp}`);
  assert.ok(n.fracao >= 0 && n.fracao <= 1, `fração fora de 0..1 em xp=${xp}: ${n.fracao}`);
  assert.ok(n.xpNoNivel >= 0, `xpNoNivel negativo em xp=${xp}`);
}

// --- a progressão é monotônica -------------------------------------------
let anterior = 0;
for (let xp = 0; xp <= 30_000; xp += 250) {
  const n = nivelDe(xp).atual.numero;
  assert.ok(n >= anterior, `nível caiu de ${anterior} para ${n} em xp=${xp}`);
  anterior = n;
}

console.log("levels: autoteste OK");
