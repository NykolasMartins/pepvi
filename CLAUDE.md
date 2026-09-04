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
node lib/custoIA.check.ts      # custo estimado de IA
node test-vision.js --selftest # métrica de erro de transcrição
node supabase/verificar-sorteio.mjs 400   # distribuição do sorteio (precisa de .env.local)
```

Rode os `*.check.ts` depois de qualquer mudança em `lib/enem.ts`, `lib/scoring.ts`, `lib/levels.ts`, `lib/stats.ts` ou `lib/matchStatus.ts` ou `lib/custoIA.ts`.

## SQL — a ordem importa

No SQL Editor do Supabase, **nesta ordem**:

```
supabase/schema.sql
supabase/ranking-e-dificuldades.sql
supabase/amigos-e-duelos.sql
supabase/admin.sql
supabase/fix-game-loop.sql
supabase/seed-temas.sql + seed-dicas.sql   (local; no repo público: seed-exemplo.sql)
```

Os três últimos dependem de `difficulties` e `xp_total()`, criados no segundo. `admin.sql` vem **antes** de `fix-game-loop.sql`: `iniciar_partida` passou a ler a tabela `config` criada lá.

**O treino livre mudou os quatro primeiros** (colunas `is_free`, `paused_at`, `paused_seconds`, `themes.created_by`; a policy `themes_read`; os dois sorteios de tema; `xp_total`, `ranking`, `abrir_dica`, `enviar_partida`, `pausar_partida`, `retomar_partida`, `iniciar_partida`). São idempotentes: rode os quatro de novo, nesta ordem. A consulta no fim de `fix-game-loop.sql` confere — `versao_nova` tem de ser 1.

---

## Invariantes — quebrar qualquer um destes é regressão

### Uma função SQL, um arquivo

`iniciar_partida` viveu em dois arquivos e o resultado passou a depender da **ordem de execução**: rodar o fix e depois "rodar o schema por segurança" reinstalava a versão antiga. Isso custou três rodadas de depuração.

Antes de criar função, `grep -rn "function <nome>" supabase/`. Se já existe, edite lá. Ao mudar assinatura, `drop function` explícito das assinaturas antigas — `create or replace` substitui só uma, e o PostgREST pode continuar resolvendo para a outra.

### O relógio mora no Postgres

`started_at` vem de `now()` do banco. A decisão sobre prazo acontece dentro de `enviar_partida()`. O cronômetro do cliente é cosmético.

Nunca aceitar duração ou timestamp vindo do cliente. `iniciar_partida` recebe `p_difficulty`, não segundos, exatamente por isso.

A pausa (`pausar_partida` / `retomar_partida`) é a segunda exceção, e pela mesma razão: só existe onde não há XP. Ela não inventa um contador — retomar **empurra o `deadline`**, então o prazo continua sendo um instante absoluto vindo do banco e o cronômetro do cliente continua cosmético. `paused_seconds` acumula o que já passou, e `enviar_partida` desconta ele mais a pausa aberta no instante do envio.

**Partida pausada não expira — mas tem teto de 24 h.** Sem o teto ela ficaria viva para sempre em cima de `one_active_match`, e um treino pausado e esquecido impediria toda partida nova: o mesmo travamento de game loop que já custou três rodadas, com outra causa. O valor aparece em **três** lugares que precisam concordar — a materialização em `iniciar_partida`, o `retomar_partida`, e `PAUSE_TIMEOUT_MS` em `lib/matchStatus.ts`. Quem lê `effectiveStatus` precisa passar `paused_at`, senão declara expirada uma partida congelada.

A exceção é `p_minutes`, do treino livre — e ela só existe porque lá não há XP. A regra que a proibia era "escolher os segundos é escolher a própria dificuldade, e o bônus de velocidade é calculado sobre ela": sem XP em jogo não há o que inflar. Piso e teto (5 a 240 min) ficam no Postgres; `lib/treinoLivre.ts` só evita o seletor oferecer o que o banco vai recusar.

### Regra de nota mora em código, não no prompt

O modelo reporta **evidência** (booleanos, contagens); `lib/enem.ts` aplica o **teto**. Tetos nunca sobem nota, só limitam, e cada um devolve um `motivo` que vira feedback na tela.

Mudou a rubrica em `lib/rubric.ts`? **Suba `RUBRIC_VERSION`.** Ela vai gravada em cada correção; sem o bump, o histórico de evolução compara notas medidas com réguas diferentes.

### Derivar status na leitura tem limite

`lib/matchStatus.ts` deriva `expired` e `grading_failed` sem cron. Serve para **exibir**.

Onde uma restrição **física** lê a coluna — o índice parcial `one_active_match` — o valor precisa ser **materializado**. `iniciar_partida` faz isso com dois `UPDATE` no início da transação. `matchStatus.ts` e esses `UPDATE` precisam concordar.

### Elegibilidade a XP vem de `elapsed_seconds`

Nunca de `status`. `status` é sobrescrito por reprocessamento; `elapsed_seconds` é gravado uma vez. Ver `isLate()`.

### Treino livre não pontua, e a trava é em cinco lugares

`matches.is_free`. Coluna própria, não `difficulty = 'livre'`: `difficulty` carrega o `xp_multiplier` e é lida na correção, e empilhar "não vale nada" nela faria uma coluna significar duas coisas.

O que depende de `is_free`, e por quê:

| Onde | Regra |
| --- | --- |
| `computeXp()` | `isFree` devolve zero antes de qualquer conta |
| `xp_total()` | `and not is_free` — senão vira XP e desbloqueio de graça |
| `ranking()` | idem, e `partidas` é o critério de desempate |
| `sortear_tema` e `sortear_tema_duelo` | `and not m.is_free` — treino **não queima** tema |
| `abrir_dica()` | recusa: sem XP a dica não tem preço |
| `pausar_partida()` | recusa fora do livre: parar o relógio infla o bônus de velocidade |

A redundância é deliberada. O XP nasce em `computeXp`; deixar a proteção só na consulta significa que a próxima leitura que esquecer o filtro passa a pagar.

**Sem dicas no treino livre.** O jogador escolhe o tema ali. Liberar dica seria abrir caminho para ler repertório e tese de qualquer tema de graça, com calma, antes de encarar o mesmo tema valendo.

**O treino livre não queima tema** — daí `listThemes()` marcar o que já foi feito, e o "temas inéditos" do lobby contar só partidas com `is_free = false`.

**Tema escrito pelo jogador é uma linha em `themes` com `created_by` e `active = false`**, não uma coluna `custom_theme` em `matches`. `theme_id` é NOT NULL com FK, e a correção, o resultado e o histórico leem o tema por esse join — uma segunda forma de guardar tema viraria um `coalesce` em cada um deles, e o primeiro esquecido mostraria "(tema removido)". `active = false` é o que mantém o tema fora da roleta sem `sortear_tema` precisar saber que ele existe.

O **enunciado é montado em `iniciar_partida`**, nunca recebido do cliente: ele viaja junto do tema no prompt de correção, e a instrução sobre direitos humanos que a Competência 5 cobra não pode depender do que veio no POST. Índice único parcial `themes_custom_por_usuario` dedupe por `(created_by, lower(title))` — reescrever o mesmo tema é o caso de uso, e sem ele cada treino criaria uma linha nova.

`themes_read` deixou de ser `using (true)`: tema de treino é escrita pessoal, e a política antiga vazaria o de todo mundo para todo mundo.

### Teto de correções mora no banco, e o cliente não sabe o número

Cada redação enviada custa 1 ou 2 chamadas de IA, e a cota do Gemini é **diária e compartilhada por todos os jogadores** — na conta atual, 20 requisições/dia no modelo de avaliação. Sem teto, um jogador sozinho no treino livre (ilimitado, sem XP) consome a cota do dia e a correção passa a falhar para todo mundo.

O limite é **10 envios em janela deslizante de 24 h**, checado em `iniciar_partida()`. Três decisões que valem preservar:

- **No início, não no envio.** Recusar em `enviar_partida` faria o aluno descobrir o teto depois de escrever a redação.
- **Depois do "existe partida ativa? devolve ela".** Quem já está no meio de uma partida precisa voltar para ela mesmo tendo batido o teto.
- **Janela deslizante, não dia de calendário.** Dia de calendário depende de fuso (o banco roda em UTC) e cria a borda de gastar o teto às 23h59 e o seguinte às 00h01.

`redacoes_restantes()` devolve **quantas faltam, nunca o limite** — o cliente não recebe o número, e é isso que impede uma segunda cópia da regra em TypeScript divergir da que barra. O `10` aparece em dois lugares no mesmo arquivo (`iniciar_partida` e `redacoes_restantes`) e os dois precisam concordar.

O botão desabilitado no lobby é cortesia; quem barra é o Postgres.

### O painel admin não usa `service_role`

Toda agregação de `/admin` cruza usuários, e a RLS de `matches` restringe a `auth.uid()`. A saída tentadora seria `requireAdmin()` — e é justamente por **ignorar RLS** que ela não serve: um erro de rota, um layout que esquece a guarda, e o banco inteiro vaza.

O padrão é o de `ranking()`: funções `security definer` em `supabase/admin.sql` que **começam com `if not sou_admin() then raise`**. A guarda mora no banco, não em TypeScript — `app/admin-actions.ts` de propósito **não** repete a checagem, porque uma segunda cópia da regra é o que diverge da que protege. O layout do Next protege a *tela*; a função protege o *dado*, e ela é chamável pela API REST do Supabase por qualquer pessoa logada.

**`profiles.is_admin` seria uma escada de privilégio sem o `revoke`.** A policy `profiles_self` é `for all`, então o usuário escreve no próprio profile — é o que faz o campo de nome funcionar. Com `is_admin` sendo só mais uma coluna, qualquer um vira admin com `update profiles set is_admin = true where id = auth.uid()`. RLS não ajuda: a linha é dele. O que fecha é privilégio de **coluna**:

```sql
revoke update on profiles from authenticated, anon;
grant  update (username) on profiles to authenticated;
```

Consequência: **coluna nova em `profiles` nasce sem permissão de escrita para o usuário.** Se o jogador precisar editar outra coisa, acrescente ao `grant` — o sintoma é gravação que não acontece e não dá erro na tela.

O primeiro admin nasce de um `update` manual no SQL Editor. Não há tela para promover: exigiria um admin para começar.

### Ler redação de aluno deixa rastro

`admin_partida()` grava em `admin_access_log` **na mesma transação** em que devolve o texto — mesmo desenho de `abrir_dica()`. Por isso a lista (`admin_partidas`) traz só metadados: puxar transcrição ali geraria uma linha de log por item a cada abertura da lista e o registro perderia o sentido. A rota de detalhe usa `prefetch={false}` — um hover não pode virar acesso registrado.

### Um arquivo `"use server"` só exporta função async

Nem constante, nem `export const x = () => promise` — arrow function não conta como async e o build falha com *"Server Actions must be async functions"*. Foi assim que `TREINO_LIVRE_MIN_MINUTOS` teve de sair de `app/actions.ts` para `lib/treinoLivre.ts`, e que `app/admin-actions.ts` quebrou na primeira tentativa. Constante compartilhada vai para `lib/`.

### Dois clientes Supabase

`supabaseUser()` é o padrão — carrega a sessão, RLS vale. `requireAdmin()` (service_role, ignora RLS) aparece em **três** lugares, cada um comentado: URL assinada de upload, leitura do Storage privado, escrita da correção.

Variável de ambiente é lida e validada **na chamada**, nunca no topo do módulo. Validar no topo quebra o `next build` com "Failed to collect configuration": o build avalia os módulos para coletar config de rota, e ambiente de build não tem segredo de runtime. Teste: `mv .env.local .tmp && npm run build` tem de passar.

Ao adicionar leitura de dado do usuário, use `supabaseUser()` e **não** acrescente `.eq("user_id", ...)` — a RLS já filtra. Filtro redundante mascara política frouxa.

### `hints` não tem política de leitura

De propósito. O conteúdo só sai por `abrir_dica()`, que grava a cobrança e devolve o texto na mesma transação. Mandar dica no payload e esconder com CSS transformaria a penalidade em enfeite.

### `useActionState` com função variável é bug

Passar `modo === "x" ? acaoA : acaoB` para `useActionState` **não funciona**: o
hook guarda a função do render em que criou o `formAction`, então trocar a aba
muda o rótulo do botão e não a ação enviada. Custou um login que mandava
cadastro estando em "Entrar".

Uma Server Action só, e o que varia vai em campo `hidden` do formulário. Ver
`authenticate()` em `app/auth-actions.ts`. Vale para qualquer formulário com
modo — não repetir o padrão antigo.

### Variável de ambiente se valida na chamada

Nunca no topo do módulo. Validar no escopo do módulo quebra o `next build` com
"Failed to collect configuration": o build avalia os módulos para coletar
config de rota, e ambiente de build não tem segredo de runtime.

Teste antes de subir: `mv .env.local .tmp; npm run build` tem de passar.

### Transcrição é proibida de corrigir

A etapa de visão preserva os erros do aluno. Se ela "conserta" a ortografia, a Competência 1 dá nota cheia para todo mundo. Mesma razão pela qual o textarea do modo digitado tem `spellCheck={false}` e os atributos anti-Grammarly — não mexer.

---

## Convenções

- **Comentários e identificadores de domínio em português.** Comentário explica *por quê*, não *o quê*.
- **Sem framework de teste.** `assert` do Node, arquivos `*.check.ts`. O que se testa é aritmética que decide pontuação e regra do ENEM: código que, quando erra, não lança exceção — só distribui nota errada.
- **Sem dependência nova sem motivo medido.** Gráficos são SVG inline; não instalar biblioteca de chart.
- **`node` roda `.ts` nativo** nesta versão. Por isso `tsconfig.json` tem `allowImportingTsExtensions` e os `*.check.ts` importam com extensão.
- Heredoc de shell quebra com o conteúdo acentuado deste projeto. Para edições grandes, use a ferramenta Write ou um script Python no scratchpad.
- **O terminal do usuário é PowerShell 5.1: não existe `&&`.** Encadear é `cmd; if ($?) { cmd2 }`, ou um comando por linha. Sugerir `a && b` gera erro de parser.
- **`/login` dando 404 em dev = `.next` sujo.** Acontece ao rodar `npm run build` e depois `next dev` no mesmo diretório. `rm -rf .next` e subir de novo.

## Conteúdo fora do repositório

`supabase/seed-temas.sql` (22 temas) e `supabase/seed-dicas.sql` (66 dicas) estão no `.gitignore`: é curadoria editorial, o único ativo que o código não reproduz. Existem no disco. O repositório público traz `seed-exemplo.sql` com 3 temas e 9 dicas.

## Pendências conhecidas

- **`ANCHORS` vazio em `lib/rubric.ts`.** Sem exemplo calibrado o modelo regride à média (600–700 para tudo). Precisa de 3 redações reais corrigidas por humano. Maior alavanca de qualidade pendente. Âncora errada calibra errado — não inventar.
- **Correção roda na requisição, dividida em duas etapas** (transcrição, depois avaliação), uma por chamada de `gradeMatch()`. Foi assim que ela passou a caber no teto de 60 s de função serverless. `submissions.vision_meta` carrega o que a etapa 1 produz e a etapa 2 precisa.
- **`disputeTranscript` limpa `transcript` e `vision_meta`** — é o que força a releitura da foto. Sem isso a contestação reavaliaria o mesmo texto contestado.
- **Textos motivadores e dicas** priorizam lei e fato histórico verificável em vez de estatística com número, para não ensinar dado errado. Manter essa disciplina ao acrescentar conteúdo.
- **Deploy na Vercel**, a partir de `main` no GitHub (repositório público `NykolasMartins/pepvi`). As 4 variáveis de ambiente precisam estar nos três ambientes; variável adicionada depois de um deploy só entra com Redeploy.
- **Aviso do Next 16:** `middleware` virou `proxy`. Funciona hoje; migrar com `npx @next/codemod@canary middleware-to-proxy .` quando der.
- **Recuperação de senha depende de config no painel.** `resetPasswordForEmail`
  manda o link com `redirectTo` = `<origem>/auth/confirm?next=/nova-senha`, e a
  origem vem do header `host` da requisição — não de variável de ambiente, para
  acertar localhost, preview e produção sem cadastrar nada. Em troca,
  **Authentication > URL Configuration > Redirect URLs** precisa listar
  `http://localhost:3000/**` e `https://<dominio>/**`; sem isso o Supabase
  ignora o `redirectTo` e joga na Site URL, o `code` se perde e o link "funciona"
  caindo na tela de login. `/auth/confirm` aceita `code` (template padrão) e
  `token_hash` (template reescrito) porque trocar o template do e-mail é comum.
- **`PRECOS` vazio em `lib/custoIA.ts`.** O painel mostra tokens e omite o valor em dólar até você preencher com os preços do billing. Vazio é deliberado: preço inventado vira estimativa com cara de fato, e decisão de orçamento sai dela. Anote a data em `conferidoEm`.
- **Curadoria só existe no disco desta máquina.** `seed-temas.sql` e `seed-dicas.sql` estão fora do Git. Fazer backup.
