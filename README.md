# PEPVI

Jogo de treino de redação do ENEM. Um tema é sorteado, um cronômetro de 90 minutos começa, o aluno escreve à mão e fotografa (ou digita), e uma IA corrige nas 5 competências. A nota vira XP, com bônus por velocidade e penalidade por dicas usadas.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Storage, RLS) · Google Gemini (visão + avaliação)

---

## As decisões que definem o projeto

Isto não é um CRUD com cronômetro na tela. Três problemas dominaram o desenho.

### 1. O relógio não pode morar no cliente

É um jogo contra o tempo. Se o navegador decide quanto tempo resta, o jogo acabou antes de começar.

`started_at` vem de `now()` do **Postgres**, nunca do Node e jamais do navegador. O cliente recebe um `deadline` absoluto e um `serverNow`, mede o próprio desvio de relógio uma vez e desenha a contagem. F5 não zera nem estende. Fechar a aba não pausa. Adiantar o relógio do sistema não ajuda: quem decide se o envio entrou no prazo é uma comparação feita dentro de `enviar_partida()`, no banco.

O cronômetro na tela é cosmético — e está escrito assim no código.

### 2. Regra que o modelo pode esquecer não pode morar no prompt

A IA avaliava mal: dava 160 em argumentação para "o governo não fiscaliza direito", e 200 em proposta de intervenção aceitando "para salvar a floresta" como detalhamento. Endurecer o prompt ajuda e não garante.

A arquitetura final: **o modelo reporta evidência, o código aplica o teto.**

```ts
// lib/enem.ts
ceilingC1(score, { oralityMarksCount })   // 2 marcas de oralidade → teto 120
ceilingC2(score, { onlyFromMotivatingTexts, ... })  // repertório só do enunciado → 120
ceilingC3(score, { reliesOnCommonSense, argumentsHaveCausalChain, ... })
scoreC5(flags)  // 5 elementos × 40, teto 160 sem agente nomeado
```

O modelo devolve booleanos e contagens; a nota sai de funções puras, testadas, que nunca sobem nota — só limitam. Cada teto carrega o motivo em texto, e o motivo vira feedback na tela: o aluno lê *"nota limitada: argumentos apoiados em senso comum"* em vez de só ver 120.

A rubrica é versionada (`enem-v3`) e a versão vai gravada em cada correção — sem isso, ajustar a régua invalidaria em silêncio todo o histórico de evolução do usuário.

### 3. Transcrição e avaliação são etapas separadas

Ler caligrafia e julgar texto são problemas diferentes. Juntos num prompt só, produzem nota que ninguém audita.

A etapa de visão é proibida de corrigir o texto — se ela "conserta" a ortografia do aluno, a Competência 1 dá nota cheia para todo mundo e a avaliação inteira vira decoração. A transcrição é mostrada ao usuário em modo leitura, com botão de contestação: nota baixa por erro de leitura é indistinguível de nota baixa merecida, e a confiança morre na primeira injustiça. Editar é proibido pelo motivo oposto — editar seria corrigir a própria ortografia.

Foto ilegível cai num estado `needs_reupload` que **não consome a partida**: o relógio já parou, e punir problema de câmera seria punir a coisa errada.

---

## Outras coisas que valem olhar

**Sorteio sem repetição sem tabela auxiliar.** "Temas já jogados" é derivado de `matches` com `NOT EXISTS`. Uma tabela espelho seria uma segunda verdade capaz de dessincronizar — e se dessincronizasse, o usuário receberia tema repetido, que é justamente a regra obrigatória do produto. Há um verificador executável (`supabase/verificar-sorteio.mjs`) que roda o sorteio N vezes e mede a distribuição: aleatoriedade é o tipo de coisa que parece funcionar até não funcionar.

**Dicas que o DevTools não entrega.** A tabela `hints` tem RLS ligada e **nenhuma** política de leitura. O conteúdo só sai por `abrir_dica()`, que grava o log de cobrança e devolve o texto na mesma transação. Mandar as dicas no payload e esconder com CSS transformaria a penalidade em enfeite.

**Derivar status na leitura tem um limite.** Partida vencida vira `expired` sem cron. Mas um índice único parcial filtra por `status`, e regra derivada não satisfaz restrição física — a partida "expirada" na tela continuava `in_progress` na coluna e travava o game loop. A lição está no código: onde um índice lê a coluna, o valor precisa ser materializado.

**Elegibilidade a XP vem de `elapsed_seconds`, não de `status`.** `status` é mutável (reprocessamento sobrescreve); `elapsed_seconds` é gravado uma vez. Ler do campo errado pagaria XP para entrega atrasada na segunda tentativa.

**Autenticação com dois clientes.** `supabaseUser()` carrega a sessão e respeita RLS — é o padrão. `service_role` aparece em exatamente três lugares, cada um comentado com o motivo: emitir URL assinada de upload, ler o Storage privado e gravar a correção.

---

## Testes

Oito verificações executáveis, sem framework:

```bash
node lib/grading.check.ts   # tetos das competências, C5, status derivado, estatísticas
node lib/scoring.check.ts   # fórmula de XP, penalidade, dificuldade
node lib/levels.check.ts    # níveis e a borda do último
node test-vision.js --selftest   # métrica de erro de transcrição
```

Não há Jest nem Vitest de propósito. O que é testado é aritmética que decide pontuação e regra do ENEM — código que, quando erra, **não lança exceção nenhuma**: só distribui nota errada por semanas. Cobrir isso com `assert` do Node custa zero dependência e roda em 200 ms.

Cada caso guarda a razão de existir. `assert.equal(ceilingC1(160, { oralityMarksCount: 2 }).score, 120)` documenta a redação real que motivou a mudança.

---

## Rodando

Precisa de um projeto Supabase e uma chave do Google AI Studio.

```bash
npm install
cp .env.local.example .env.local   # preencher as 4 variáveis
```

No SQL Editor do Supabase, **nesta ordem**:

```
supabase/schema.sql
supabase/ranking-e-dificuldades.sql
supabase/amigos-e-duelos.sql
supabase/fix-game-loop.sql
supabase/seed-exemplo.sql
```

Em Authentication → Providers → Email, desligue *Confirm email* para desenvolvimento.

```bash
npm run dev
```

---

## Mapa

```
app/
  page.tsx                lobby: nível, dificuldade, sorteio
  match/[id]/             partida: cronômetro, dicas, envio, correção
  match/[id]/result/      nota por competência, composição do XP, transcrição
  progresso/              dashboard: barras ou pentágono, evolução, histórico
  ranking/                semanal, mensal, histórico
  duelos/                 amigos por código e duelos assíncronos
lib/
  enem.ts                 regras de nota — zero dependências, testável no Node
  scoring.ts              fórmula de XP
  gemini.ts               pipeline de visão e avaliação
  rubric.ts               matriz do ENEM, versionada
  matchStatus.ts          status derivado na leitura
supabase/                 schema, RLS, funções
PRD.md                    documento de arquitetura, com as decisões e o porquê
```

O [PRD.md](PRD.md) tem o raciocínio completo, incluindo as decisões que foram revistas durante a construção e por quê.

---

## O que não está aqui

**A curadoria.** O banco completo tem 22 temas com textos motivadores e 66 dicas de repertório sociocultural — referências reais a obras, leis e fatos históricos, escolhidas uma a uma. É o único ativo que o código não reproduz, e fica fora do repositório público. `supabase/seed-exemplo.sql` traz 3 temas e 9 dicas, suficiente para o projeto rodar de ponta a ponta.

**Âncoras de calibração.** `lib/rubric.ts` tem um array `ANCHORS` vazio, de propósito. Modelo sem exemplo calibrado regride à média e distribui 600–700 para tudo. Preencher exige 3 redações reais corrigidas por um professor — e âncora errada calibra errado, o que é pior que âncora nenhuma. É a maior alavanca de qualidade pendente.

**Fila de correção.** A correção roda na requisição, dividida em duas etapas — uma chamada lê a foto, outra avalia — com polling no cliente. Cabe no teto de função serverless e evita repagar a leitura da imagem quando a avaliação falha. Uma fila de verdade só se justifica com volume.
