#!/usr/bin/env node
/**
 * PEPVI — Fase 0: Prova de leitura de caligrafia (Google Gemini).
 *
 * Script descartável. Não faz parte da aplicação: mede se a transcrição de
 * redação manuscrita é boa o bastante para o produto existir. Se o erro médio
 * ficar acima de 3% em foto legível, o PRD inteiro muda antes da primeira tela.
 *
 * SDK: @google/genai (Google AI Studio).
 * Modelos: gemini-3.6-flash / gemini-3.1-pro-preview.
 *
 * Uso:
 *   node test-vision.js ./fotos
 *   node test-vision.js ./fotos --models=gemini-3.6-flash,gemini-3.1-pro-preview
 *   node test-vision.js ./fotos --runs=2
 *   node test-vision.js ./fotos --thinking=0
 *   node test-vision.js --selftest
 *
 * Gabarito: para cada foto.jpg, um foto.txt ao lado com a transcrição
 * conferida à mão. Sem o .txt o script só imprime o que a IA leu (conferência
 * manual). Com o .txt ele calcula o CER (Character Error Rate).
 */

const fs = require("fs");
const path = require("path");

// --------------------------------------------------------------------------
// Configuração
// --------------------------------------------------------------------------

/**
 * Preços em US$ por 1M de tokens (Gemini API, tier pago).
 * Atenção: os tokens de "thinking" são cobrados como saída.
 *
 * ⚠️ PREÇOS NÃO CONFIRMADOS para os modelos abaixo — estão zerados de
 * propósito para não inventar número. Enquanto ficarem em 0, a coluna de custo
 * do relatório sai $0.0000 e deve ser ignorada. Preencher com os valores de
 * ai.google.dev/pricing antes de usar isso para projetar custo por correção.
 *
 * canDisableThinking também não foi verificado: em false o --thinking=0 não é
 * enviado (e o script avisa), que é o lado seguro — parâmetro não suportado
 * derruba a chamada com 400.
 */
const MODELS = {
  "gemini-3.6-flash":       { in: 0, out: 0, canDisableThinking: false },
  "gemini-3.1-pro-preview": { in: 0, out: 0, canDisableThinking: false },
};

const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.1-pro-preview"];

const CER_GATE = 0.03;        // critério de continuidade do PRD
const MAX_OUTPUT_TOKENS = 16384; // ver nota em buildConfig()
const MAX_ATTEMPTS = 3;       // 429/503 são rotina no Gemini

const MEDIA_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

/**
 * A instrução de não corrigir é o núcleo do teste. Um modelo bem treinado quer
 * consertar o texto enquanto lê; se ele consertar, a Competência 1 dá 200 para
 * todo mundo e a avaliação inteira perde sentido. O gabarito deve preservar os
 * erros originais do aluno justamente para que o CER acuse esse comportamento.
 */
const PROMPT = `Você recebe a foto de uma redação dissertativo-argumentativa escrita à mão.

Transcreva LITERALMENTE o que está escrito na folha.

Regras absolutas:
- Preserve TODOS os erros de ortografia, acentuação, concordância e pontuação exatamente como aparecem. NÃO corrija nada.
- Preserve a grafia original mesmo quando estiver claramente errada.
- Preserve a divisão em parágrafos com uma linha em branco entre eles.
- Marque trechos que você não conseguir ler como [ilegível].
- Não inclua título, cabeçalho, numeração de linha, nome do aluno ou comentários seus.
- Não adicione nenhuma explicação antes ou depois.

Depois da transcrição, pule uma linha e escreva exatamente uma última linha no formato:
LEGIBILIDADE: 0.00
onde o número entre 0 e 1 indica sua confiança na leitura da foto.`;

// --------------------------------------------------------------------------
// Métrica
// --------------------------------------------------------------------------

/**
 * Normaliza apenas espaçamento. NÃO mexe em acento nem em caixa: acentuação e
 * maiúscula são exatamente o que a Competência 1 avalia — apagá-las aqui
 * esconderia o erro que mais importa medir.
 */
function normalize(s) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

/** Distância de Levenshtein, duas linhas. O(n*m) tempo, O(min(n,m)) memória. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) [a, b] = [b, a]; // menor no eixo da linha

  let prev = new Int32Array(a.length + 1);
  let curr = new Int32Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    const bc = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === bc ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/** Character Error Rate: erros ÷ tamanho do gabarito. */
function cer(truth, got) {
  const t = normalize(truth);
  const g = normalize(got);
  if (t.length === 0) return g.length === 0 ? 0 : 1;
  return levenshtein(t, g) / t.length;
}

/** Separa a transcrição da última linha "LEGIBILIDADE: 0.87". */
function splitOutput(raw) {
  const m = raw.match(/^LEGIBILIDADE:\s*([0-9.]+)\s*$/im);
  const legibility = m ? parseFloat(m[1]) : null;
  const text = raw.replace(/^LEGIBILIDADE:\s*[0-9.]+\s*$/im, "").trim();
  return { text, legibility };
}

// --------------------------------------------------------------------------
// Camada Gemini
// --------------------------------------------------------------------------

let _ai = null;
function ai() {
  // require preguiçoso: --selftest roda sem a SDK instalada e sem chave.
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "defina GEMINI_API_KEY no ambiente (chave do Google AI Studio: aistudio.google.com/apikey)"
      );
    }
    const { GoogleGenAI } = require("@google/genai");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

function buildConfig(model, thinking) {
  const config = {
    temperature: 0, // transcrição não é tarefa criativa
    // Nos modelos Gemini com thinking o maxOutputTokens inclui os tokens de
    // raciocínio. Apertado demais, o thinking consome a cota e o texto volta
    // vazio com
    // finishReason MAX_TOKENS — daí a folga.
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };

  if (thinking === "off") {
    if (MODELS[model]?.canDisableThinking) {
      config.thinkingConfig = { thinkingBudget: 0 };
    }
    // Modelo que não permite desligar: omitir deixa no padrão dinâmico.
  }
  // Sem a flag: nada de thinkingConfig — vale o padrão do modelo (dinâmico).

  return config;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function transcribe(model, imagePath, thinking) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MEDIA_TYPES[ext];
  if (!mimeType) throw new Error(`extensão não suportada: ${ext}`);

  const data = fs.readFileSync(imagePath).toString("base64");

  const request = {
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data } }, // imagem antes do texto
          { text: PROMPT },
        ],
      },
    ],
    config: buildConfig(model, thinking),
  };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    try {
      const res = await ai().models.generateContent(request);
      const ms = Date.now() - t0;

      const blocked = res.promptFeedback?.blockReason;
      if (blocked) throw new Error(`prompt bloqueado: ${blocked}`);

      const finishReason = res.candidates?.[0]?.finishReason ?? null;
      const raw = res.text; // getter: já ignora as partes de "thought"

      const u = res.usageMetadata ?? {};
      const inTokens = u.promptTokenCount ?? 0;
      const thoughtTokens = u.thoughtsTokenCount ?? 0;
      const outTokens = (u.candidatesTokenCount ?? 0) + thoughtTokens; // thinking é cobrado como saída

      if (!raw) {
        throw new Error(
          finishReason === "MAX_TOKENS"
            ? `resposta vazia: o thinking consumiu os ${MAX_OUTPUT_TOKENS} tokens de saída`
            : `resposta vazia (finishReason: ${finishReason})`
        );
      }

      const price = MODELS[model] || { in: 0, out: 0 };
      const cost = (inTokens * price.in + outTokens * price.out) / 1e6;

      return { raw, ms, cost, inTokens, outTokens, thoughtTokens, finishReason, attempt };
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.code;
      const retryable = status === 429 || status === 500 || status === 503 ||
        /429|503|overloaded|rate limit|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(String(err?.message));
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;
      const wait = 2000 * 2 ** (attempt - 1);
      process.stdout.write(`  (retry ${attempt}/${MAX_ATTEMPTS - 1} em ${wait / 1000}s) `);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// --------------------------------------------------------------------------
// Execução
// --------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { dir: null, models: DEFAULT_MODELS, runs: 1, thinking: "auto", selftest: false };
  for (const a of argv) {
    if (a === "--selftest") out.selftest = true;
    else if (a.startsWith("--models=")) out.models = a.slice(9).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--runs=")) out.runs = Math.max(1, parseInt(a.slice(7), 10) || 1);
    else if (a.startsWith("--thinking=")) out.thinking = a.slice(11) === "0" || a.slice(11) === "off" ? "off" : "auto";
    else if (!a.startsWith("--")) out.dir = a;
  }
  return out;
}

const pct = (x) => (x * 100).toFixed(2) + "%";
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selftest) return selftest();

  if (!args.dir) {
    console.error("uso: node test-vision.js <pasta-com-fotos> [--models=a,b] [--runs=N] [--thinking=0]");
    process.exit(1);
  }
  if (!fs.existsSync(args.dir)) {
    console.error(`pasta não encontrada: ${args.dir}`);
    process.exit(1);
  }

  const images = fs
    .readdirSync(args.dir)
    .filter((f) => MEDIA_TYPES[path.extname(f).toLowerCase()])
    .sort()
    .map((f) => path.join(args.dir, f));

  if (images.length === 0) {
    console.error(`nenhuma imagem (${Object.keys(MEDIA_TYPES).join(", ")}) em ${args.dir}`);
    process.exit(1);
  }

  const unknown = args.models.filter((m) => !MODELS[m]);
  if (unknown.length) {
    console.log(`aviso: sem tabela de preço para ${unknown.join(", ")} — custo sairá como $0`);
  }
  // Lê da tabela em vez de citar um modelo pelo nome — nome fixo aqui vira
  // referência morta na próxima troca de geração.
  const semDesligar = args.models.filter((m) => MODELS[m] && !MODELS[m].canDisableThinking);
  if (args.thinking === "off" && semDesligar.length) {
    console.log(`aviso: ${semDesligar.join(", ")} não permite(m) desligar thinking — segue no padrão dinâmico`);
  }

  const outDir = path.join(args.dir, "_resultado");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`${images.length} foto(s) | modelos: ${args.models.join(", ")} | ${args.runs} execução(ões) | thinking: ${args.thinking}`);
  console.log(`total de chamadas: ${images.length * args.models.length * args.runs}\n`);

  const rows = [];

  for (const img of images) {
    const base = path.basename(img, path.extname(img));
    const truthPath = path.join(args.dir, base + ".txt");
    const truth = fs.existsSync(truthPath) ? fs.readFileSync(truthPath, "utf8") : null;

    console.log(`── ${path.basename(img)}${truth ? "" : "  (sem gabarito)"}`);

    for (const model of args.models) {
      for (let run = 1; run <= args.runs; run++) {
        const tag = args.runs > 1 ? `${model} #${run}` : model;
        try {
          const r = await transcribe(model, img, args.thinking);
          const { text, legibility } = splitOutput(r.raw);
          const errorRate = truth ? cer(truth, text) : null;

          // Formato: <imagem>_<modelo>_transcricao.txt. O modelo entra no meio
          // porque a mesma foto roda em dois modelos — sem isso o segundo
          // sobrescreve o arquivo do primeiro e a comparação desaparece.
          const suffix = args.runs > 1
            ? `_${model}_run${run}_transcricao.txt`
            : `_${model}_transcricao.txt`;
          const outPath = path.join(outDir, base + suffix);
          fs.writeFileSync(outPath, text, "utf8");

          rows.push({
            imagem: path.basename(img),
            modelo: model,
            execucao: run,
            arquivo: path.basename(outPath),
            cer: errorRate,
            legibilidade: legibility,
            caracteres: text.length,
            ms: r.ms,
            custoUsd: r.cost,
            tokensEntrada: r.inTokens,
            tokensSaida: r.outTokens,
            tokensThinking: r.thoughtTokens,
            finishReason: r.finishReason,
            tentativas: r.attempt,
            temGabarito: truth !== null,
          });

          // Sem gabarito a coluna de CER sai do relatório em vez de imprimir "n/d".
          console.log(
            `   OK  ${tag.padEnd(24)} ` +
            (errorRate === null ? "" : `CER ${pct(errorRate).padStart(6)}  `) +
            `leg ${legibility === null ? "n/d" : legibility.toFixed(2)}  ` +
            `${String(text.length).padStart(5)} car  ` +
            `${(r.ms / 1000).toFixed(1)}s  ` +
            `$${r.cost.toFixed(4)}` +
            (r.thoughtTokens ? `  (${r.thoughtTokens} tok thinking)` : "")
          );
          console.log(`       -> ${path.basename(outPath)}`);
        } catch (err) {
          const msg = String(err?.message || err);
          rows.push({ imagem: path.basename(img), modelo: model, execucao: run, erro: msg });
          console.log(`   ERRO ${tag.padEnd(24)} ${msg}`);
        }
      }
    }
    console.log();
  }

  const resumo = buildSummary(rows, args);
  printSummary(resumo, args);

  const payload = {
    executadoEm: new Date().toISOString(),
    sdk: "@google/genai",
    modelos: args.models,
    execucoesPorFoto: args.runs,
    thinking: args.thinking,
    criterioPrd: { cerMaximo: CER_GATE },
    resumo,
    execucoes: rows,
  };
  const jsonPath = path.join(outDir, "resultado-fase0.json");
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`\nTranscrições: ${outDir}`);
  console.log(`Resumo JSON:  ${jsonPath}`);
}

function buildSummary(rows, args) {
  const resumo = {};

  for (const model of args.models) {
    const ok = rows.filter((r) => r.modelo === model && !r.erro);
    const falhas = rows.filter((r) => r.modelo === model && r.erro);

    if (ok.length === 0) {
      resumo[model] = { execucoes: 0, falhas: falhas.length, erros: falhas.map((f) => f.erro), aprovado: null };
      continue;
    }

    const comCer = ok.filter((r) => r.cer !== null).map((r) => r.cer);
    const comLeg = ok.filter((r) => r.legibilidade !== null).map((r) => r.legibilidade);

    // Instabilidade: mesma foto, mesmo modelo, execuções diferentes.
    let variacaoEntreExecucoes = null;
    if (args.runs > 1) {
      const spreads = [];
      for (const img of new Set(ok.map((r) => r.imagem))) {
        const cs = ok.filter((r) => r.imagem === img && r.cer !== null).map((r) => r.cer);
        if (cs.length > 1) spreads.push(Math.max(...cs) - Math.min(...cs));
      }
      if (spreads.length) variacaoEntreExecucoes = avg(spreads);
    }

    resumo[model] = {
      execucoes: ok.length,
      falhas: falhas.length,
      fotosComGabarito: comCer.length,
      cerMedio: comCer.length ? avg(comCer) : null,
      cerPior: comCer.length ? Math.max(...comCer) : null,
      variacaoEntreExecucoes,
      legibilidadeMedia: comLeg.length ? avg(comLeg) : null,
      msMedio: Math.round(avg(ok.map((r) => r.ms))),
      custoMedioUsd: avg(ok.map((r) => r.custoUsd)),
      custoTotalUsd: ok.reduce((a, r) => a + r.custoUsd, 0),
      tokensThinkingMedio: Math.round(avg(ok.map((r) => r.tokensThinking || 0))),
      aprovado: comCer.length ? avg(comCer) < CER_GATE : null,
    };
  }

  return resumo;
}

function printSummary(resumo, args) {
  console.log("═".repeat(70));
  console.log("RESUMO POR MODELO");
  console.log("═".repeat(70));

  for (const model of args.models) {
    const s = resumo[model];
    console.log(`\n${model}`);

    if (s.execucoes === 0) {
      console.log(`  nenhuma execução bem-sucedida (${s.falhas} falha[s])`);
      console.log(`  primeiro erro: ${s.erros[0]}`);
      continue;
    }

    if (s.cerMedio !== null) {
      console.log(`  CER médio ............... ${pct(s.cerMedio)}  (pior: ${pct(s.cerPior)}, em ${s.fotosComGabarito} execução[ões] com gabarito)`);
    } else {
      console.log(`  CER médio ............... sem gabarito — confira as transcrições à mão`);
    }
    if (s.variacaoEntreExecucoes !== null) {
      console.log(`  variação entre execuções  ${pct(s.variacaoEntreExecucoes)}`);
    }
    console.log(`  legibilidade média ...... ${s.legibilidadeMedia === null ? "n/d" : s.legibilidadeMedia.toFixed(2)}`);
    console.log(`  latência média .......... ${(s.msMedio / 1000).toFixed(1)}s`);
    console.log(`  custo médio ............. $${s.custoMedioUsd.toFixed(4)} por foto`);
    console.log(`  custo total ............. $${s.custoTotalUsd.toFixed(4)}`);
    if (s.tokensThinkingMedio) console.log(`  thinking médio .......... ${s.tokensThinkingMedio} tokens (cobrados como saída)`);
    if (s.falhas) console.log(`  falhas .................. ${s.falhas}`);

    if (s.aprovado !== null) {
      console.log(`  ${s.aprovado ? "✅ PASSA" : "❌ NÃO PASSA"} no critério do PRD (CER < ${pct(CER_GATE)})`);
    }
  }
  console.log();
}

// --------------------------------------------------------------------------
// Autoteste — roda sem SDK e sem chave de API
// --------------------------------------------------------------------------

function selftest() {
  const assert = require("assert");

  // Levenshtein
  assert.strictEqual(levenshtein("kitten", "sitting"), 3);
  assert.strictEqual(levenshtein("", "abc"), 3);
  assert.strictEqual(levenshtein("abc", ""), 3);
  assert.strictEqual(levenshtein("abc", "abc"), 0);
  assert.strictEqual(levenshtein("abc", "abd"), 1);
  assert.strictEqual(levenshtein("saturday", "sunday"), 3);
  assert.strictEqual(levenshtein("sunday", "saturday"), 3); // simétrico

  // CER
  assert.strictEqual(cer("abc", "abc"), 0);
  assert.strictEqual(cer("a".repeat(100), "a".repeat(99) + "b"), 0.01);
  assert.strictEqual(cer("a".repeat(50), "a".repeat(49)), 0.02); // omissão conta
  assert.strictEqual(cer("", ""), 0);
  assert.strictEqual(cer("", "x"), 1);
  assert.strictEqual(cer("abc", ""), 1);

  // Espaçamento é ruído de layout: não deve contar como erro.
  assert.strictEqual(cer("um   dois\n\n\n\ntres", "um dois\n\ntres"), 0);
  assert.strictEqual(cer("  a b  ", "a b"), 0);

  // Acento, caixa e pontuação SÃO erro — é o que a Competência 1 mede.
  assert.ok(cer("é", "e") > 0, "acento precisa contar como erro");
  assert.ok(cer("Brasil", "brasil") > 0, "caixa precisa contar como erro");
  assert.ok(cer("foi, então", "foi então") > 0, "pontuação precisa contar como erro");

  // A armadilha central: o modelo "consertar" o texto do aluno tem de aparecer no CER.
  assert.ok(
    cer("a sociedade não deveria de ser assim", "a sociedade não deveria ser assim") > 0,
    "correção silenciosa precisa ser detectada"
  );
  assert.ok(cer("concerteza", "com certeza") > 0, "erro ortográfico corrigido precisa ser detectado");

  // Parser da linha de legibilidade
  const a = splitOutput("linha um\nlinha dois\n\nLEGIBILIDADE: 0.87");
  assert.strictEqual(a.text, "linha um\nlinha dois");
  assert.strictEqual(a.legibility, 0.87);
  assert.strictEqual(splitOutput("sem marcador").legibility, null);
  assert.strictEqual(splitOutput("texto\nlegibilidade: 1.0").legibility, 1.0); // case-insensitive

  console.log("autoteste OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
