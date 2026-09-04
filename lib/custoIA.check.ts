/**
 * Autoteste do custo de IA.
 *
 * Rode: `node lib/custoIA.check.ts`
 *
 * O que se testa aqui é aritmética que decide número de orçamento: quando ela
 * erra, não lança exceção — só mostra um custo errado com cara de certo. É o
 * mesmo motivo de scoring.check.ts existir.
 *
 * A tabela PRECOS nasce vazia, então os testes injetam preços próprios em vez
 * de depender do estado dela. Assim o autoteste continua válido depois de o
 * arquivo ser preenchido com valores reais.
 */
import assert from "node:assert/strict";
import { custoDaCorrecao, custoTotal, PRECOS } from "./custoIA.ts";

// --- preços de teste, não de produção ------------------------------------
PRECOS["modelo-a"] = { entrada: 10, saida: 30, conferidoEm: "2026-09-03" };
PRECOS["modelo-b"] = { entrada: 20, saida: 60, conferidoEm: "2026-09-03" };

// Um milhão de tokens de entrada custa exatamente o preço de entrada.
assert.deepEqual(custoDaCorrecao("modelo-a", 1_000_000, 0), {
  usd: 10,
  aproximado: false,
});
assert.deepEqual(custoDaCorrecao("modelo-a", 0, 1_000_000), {
  usd: 30,
  aproximado: false,
});

// Entrada e saída somam.
assert.equal(custoDaCorrecao("modelo-a", 500_000, 100_000)!.usd, 5 + 3);

// Modelo desconhecido é null, NÃO zero: a tela precisa distinguir "não sei" de
// "não custou nada". Trocar por 0 faria um modelo sem preço sumir do total.
assert.equal(custoDaCorrecao("modelo-inexistente", 1_000_000, 0), null);

// Correção manuscrita paga dois modelos na mesma linha: média dos preços, e o
// resultado vem marcado como aproximado para a tela poder avisar.
const dois = custoDaCorrecao("modelo-a+modelo-b", 1_000_000, 1_000_000)!;
assert.equal(dois.usd, 15 + 45);
assert.equal(dois.aproximado, true);

// Se UM dos dois modelos não tem preço, o resultado é null — meia estimativa
// seria pior que nenhuma.
assert.equal(custoDaCorrecao("modelo-a+desconhecido", 1_000_000, 0), null);

// Tokens negativos (dado corrompido) não viram crédito.
assert.equal(custoDaCorrecao("modelo-a", -5_000_000, 0)!.usd, 0);

// --- soma ----------------------------------------------------------------
const total = custoTotal([
  { model: "modelo-a", tokensIn: 1_000_000, tokensOut: 0 },
  { model: "modelo-a+modelo-b", tokensIn: 1_000_000, tokensOut: 0 },
  { model: "sem-preco", tokensIn: 9_999_999, tokensOut: 9_999_999 },
]);
assert.equal(total.usd, 10 + 15);
assert.equal(total.desconhecidas, 1);
assert.equal(total.aproximadas, 1);

// Lista vazia não quebra nem inventa custo.
assert.deepEqual(custoTotal([]), { usd: 0, desconhecidas: 0, aproximadas: 0 });

console.log("custo de IA: autoteste OK");
