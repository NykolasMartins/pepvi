# CLAUDE.md

Contexto para o Claude Code retomar o projeto do zero. Leia antes de mexer.

Detalhe do raciocínio e das decisões revistas: [PRD.md](PRD.md).

---

## O que é

Jogo de treino de redação do ENEM. Tema sorteado sem repetição, cronômetro de 90 min, foto da folha manuscrita (ou texto digitado), correção por IA nas 5 competências, nota vira XP.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase · Google Gemini (`gemini-3.6-flash`).

## Comandos

```bash
npm run dev
npm run build                  # roda o TypeScript; use como verificação
node lib/grading.check.ts      # tetos das competências, C5, status, estatísticas
node lib/scoring.check.ts      # XP, penalidade de dicas, dificuldade
node lib/levels.check.ts       # níveis
node test-vision.js --selftest # métrica de erro de transcrição
node supabase/verificar-sorteio.mjs 400   # distribuição do sorteio (precisa de .env.local)
```

Rode os `*.check.ts` depois de qualquer mudança em `lib/enem.ts`, `lib/scoring.ts`, `lib/levels.ts`, `lib/stats.ts` ou `lib/matchStatus.ts`.

## SQL — a ordem importa

No SQL Editor do Supabase, **nesta ordem**:

```
supabase/schema.sql
supabase/ranking-e-dificuldades.sql
supabase/amigos-e-duelos.sql
supabase/fix-game-loop.sql
supabase/seed-temas.sql + seed-dicas.sql   (local; no repo público: seed-exemplo.sql)
```

Os três últimos dependem de `difficulties` e `xp_total()`, criados no segundo.

---

## Invariantes — quebrar qualquer um destes é regressão

### Uma função SQL, um arquivo

`iniciar_partida` viveu em dois arquivos e o resultado passou a depender da **ordem de execução**: rodar o fix e depois "rodar o schema por segurança" reinstalava a versão antiga. Isso custou três rodadas de depuração.

Antes de criar função, `grep -rn "function <nome>" supabase/`. Se já existe, edite lá. Ao mudar assinatura, `drop function` explícito das assinaturas antigas — `create or replace` substitui só uma, e o PostgREST pode continuar resolvendo para a outra.

### O relógio mora no Postgres

`started_at` vem de `now()` do banco. A decisão sobre prazo acontece dentro de `enviar_partida()`. O cronômetro do cliente é cosmético.

Nunca aceitar duração ou timestamp vindo do cliente. `iniciar_partida` recebe `p_difficulty`, não segundos, exatamente por isso.

### Regra de nota mora em código, não no prompt

O modelo reporta **evidência** (booleanos, contagens); `lib/enem.ts` aplica o **teto**. Tetos nunca sobem nota, só limitam, e cada um devolve um `motivo` que vira feedback na tela.

Mudou a rubrica em `lib/rubric.ts`? **Suba `RUBRIC_VERSION`.** Ela vai gravada em cada correção; sem o bump, o histórico de evolução compara notas medidas com réguas diferentes.

### Derivar status na leitura tem limite

`lib/matchStatus.ts` deriva `expired` e `grading_failed` sem cron. Serve para **exibir**.

Onde uma restrição **física** lê a coluna — o índice parcial `one_active_match` — o valor precisa ser **materializado**. `iniciar_partida` faz isso com dois `UPDATE` no início da transação. `matchStatus.ts` e esses `UPDATE` precisam concordar.

### Elegibilidade a XP vem de `elapsed_seconds`

Nunca de `status`. `status` é sobrescrito por reprocessamento; `elapsed_seconds` é gravado uma vez. Ver `isLate()`.

### Dois clientes Supabase

`supabaseUser()` é o padrão — carrega a sessão, RLS vale. `requireAdmin()` (service_role, ignora RLS) aparece em **três** lugares, cada um comentado: URL assinada de upload, leitura do Storage privado, escrita da correção.

Ao adicionar leitura de dado do usuário, use `supabaseUser()` e **não** acrescente `.eq("user_id", ...)` — a RLS já filtra. Filtro redundante mascara política frouxa.

### `hints` não tem política de leitura

De propósito. O conteúdo só sai por `abrir_dica()`, que grava a cobrança e devolve o texto na mesma transação. Mandar dica no payload e esconder com CSS transformaria a penalidade em enfeite.

### Transcrição é proibida de corrigir

A etapa de visão preserva os erros do aluno. Se ela "conserta" a ortografia, a Competência 1 dá nota cheia para todo mundo. Mesma razão pela qual o textarea do modo digitado tem `spellCheck={false}` e os atributos anti-Grammarly — não mexer.

---

## Convenções

- **Comentários e identificadores de domínio em português.** Comentário explica *por quê*, não *o quê*.
- **Sem framework de teste.** `assert` do Node, arquivos `*.check.ts`. O que se testa é aritmética que decide pontuação e regra do ENEM: código que, quando erra, não lança exceção — só distribui nota errada.
- **Sem dependência nova sem motivo medido.** Gráficos são SVG inline; não instalar biblioteca de chart.
- **`node` roda `.ts` nativo** nesta versão. Por isso `tsconfig.json` tem `allowImportingTsExtensions` e os `*.check.ts` importam com extensão.
- Heredoc de shell quebra com o conteúdo acentuado deste projeto. Para edições grandes, use a ferramenta Write ou um script Python no scratchpad.

## Conteúdo fora do repositório

`supabase/seed-temas.sql` (22 temas) e `supabase/seed-dicas.sql` (66 dicas) estão no `.gitignore`: é curadoria editorial, o único ativo que o código não reproduz. Existem no disco. O repositório público traz `seed-exemplo.sql` com 3 temas e 9 dicas.

## Pendências conhecidas

- **`ANCHORS` vazio em `lib/rubric.ts`.** Sem exemplo calibrado o modelo regride à média (600–700 para tudo). Precisa de 3 redações reais corrigidas por humano. Maior alavanca de qualidade pendente. Âncora errada calibra errado — não inventar.
- **Correção roda na requisição**, com polling no cliente. Por isso o deploy pede servidor persistente (Render), não função serverless com teto de 60 s.
- **Textos motivadores e dicas** priorizam lei e fato histórico verificável em vez de estatística com número, para não ensinar dado errado. Manter essa disciplina ao acrescentar conteúdo.
- **Deploy ainda não feito.** Ver a seção de hospedagem no PRD.
