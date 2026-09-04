-- PEPVI — painel de administração.
--
-- Rode DEPOIS de schema.sql, ranking-e-dificuldades.sql e amigos-e-duelos.sql,
-- e ANTES de fix-game-loop.sql — que passou a ler a tabela `config` criada aqui.
--
-- Idempotente. A consulta no fim imprime o resultado: leia antes de testar.
--
-- ==========================================================================
-- POR QUE ESTE PAINEL NÃO USA service_role
--
-- Toda agregação daqui cruza usuários, e a RLS de matches restringe a
-- auth.uid(). A saída fácil seria chamar tudo com a service_role key, que
-- ignora RLS — e é justamente por ignorar RLS que ela não serve: um erro de
-- rota, um layout que esquece a guarda, e o banco inteiro vaza.
--
-- Em vez disso, o mesmo padrão de ranking(): funções security definer que
-- COMEÇAM checando sou_admin() e devolvem só o que a tela precisa. A chave
-- service_role continua nos três lugares do pipeline de correção, e em mais
-- nenhum.
-- ==========================================================================

-- ==========================================================================
-- 1) Quem é admin
-- ==========================================================================
alter table profiles add column if not exists is_admin boolean not null default false;

-- --------------------------------------------------------------------------
-- A ESCADA DE PRIVILÉGIO QUE ESTA COLUNA ABRIRIA, E COMO ELA É FECHADA
--
-- A policy profiles_self é `for all using (auth.uid() = id)`. "for all" inclui
-- UPDATE, então todo usuário pode escrever no próprio profile — é o que faz o
-- campo de nome de exibição funcionar.
--
-- Com is_admin sendo só mais uma coluna dessa tabela, qualquer pessoa logada
-- vira admin com um POST:
--
--     update profiles set is_admin = true where id = auth.uid();
--
-- A RLS não ajuda aqui: a linha É dela, então using e with check passam. O que
-- resolve é privilégio de COLUNA, que é anterior à RLS.
--
-- Não dá para "revogar uma coluna" de quem tem o privilégio da tabela inteira:
-- em Postgres, REVOKE UPDATE (col) não corta um GRANT UPDATE de tabela. O
-- caminho é derrubar o privilégio de tabela e devolver coluna a coluna.
--
-- Consequência a lembrar: coluna NOVA em profiles nasce sem permissão de
-- escrita para o usuário. Se um dia o jogador precisar editar outra coisa,
-- acrescente-a ao grant abaixo — o sintoma será "a gravação não acontece e não
-- dá erro visível na tela".
-- --------------------------------------------------------------------------
revoke update on profiles from authenticated, anon;
grant  update (username) on profiles to authenticated;

-- Leitura de is_admin continua liberada: a própria pessoa precisa saber se é
-- admin para a tela decidir o que mostrar, e a RLS já limita à linha dela.

/**
 * É admin? Uma definição só, usada por toda função deste arquivo.
 *
 * security definer porque precisa ler profiles sem depender da policy de quem
 * chamou, e stable porque o valor não muda dentro da mesma consulta.
 */
create or replace function sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- ==========================================================================
-- 2) Configuração editável pelo painel
--
-- O teto diário de correções vivia como literal 10 dentro de
-- iniciar_partida() e redacoes_restantes(). Para o painel poder mudá-lo sem
-- deploy, ele passa a morar aqui — senão a tela teria um campo que não faz
-- nada, que é pior que não ter campo.
--
-- Tabela chave-valor de inteiros, e não uma coluna por configuração: cada
-- configuração nova viraria uma migração, e o painel já sabe ler linhas.
-- ==========================================================================
create table if not exists config (
  chave      text primary key,
  valor      integer not null,
  descricao  text not null,
  updated_at timestamptz not null default now()
);

insert into config (chave, valor, descricao) values
  ('limite_diario', 10,
   'Redações que um usuário pode enviar em 24 h. Cada uma custa 1 ou 2 chamadas de IA, e a cota do Gemini é diária e compartilhada por todos os jogadores.')
on conflict (chave) do nothing;   -- do nothing: rodar de novo não desfaz seu ajuste

alter table config enable row level security;
-- Sem policy de escrita: config só muda por admin_set_config(), que checa
-- sou_admin(). Leitura liberada porque a tela do jogador mostra quantas
-- redações restam.
drop policy if exists config_read on config;
create policy config_read on config for select using (true);

/**
 * Lê uma configuração com valor de segurança.
 *
 * O coalesce importa: se a linha sumir, iniciar_partida não pode passar a
 * aceitar redações sem limite nenhum — o modo de falha tem de ser o seguro.
 */
create or replace function config_int(p_chave text, p_padrao integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select valor from config where chave = p_chave), p_padrao);
$$;

-- ==========================================================================
-- 3) Registro de leitura de redação
--
-- O usuário autorizou o admin a ler as redações completas dos alunos. Isso é
-- texto pessoal de estudante, então cada leitura fica registrada — e o registro
-- é gravado na MESMA transação que devolve o texto, como em abrir_dica(): não
-- existe caminho que entregue o conteúdo sem deixar rastro.
-- ==========================================================================
create table if not exists admin_access_log (
  id       uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  lido_em  timestamptz not null default now()
);

create index if not exists admin_access_log_recente
  on admin_access_log (lido_em desc);

alter table admin_access_log enable row level security;
-- Nenhuma policy: o log não é lido nem escrito pela API direta. Quem escreve é
-- admin_partida(), security definer. Quem lê é admin_acessos(), idem. Deixar
-- uma policy de select aqui permitiria a um admin apagar o próprio rastro? Não
-- — mas permitiria lê-lo fora da função, e não há motivo para isso existir.

-- ##########################################################################
-- PAINÉIS — leitura
--
-- Cada função devolve jsonb com o painel inteiro, em vez de uma função por
-- número: são dezenas de agregados heterogêneos e uma chamada por card daria
-- dezenas de idas ao banco para desenhar uma tela.
--
-- Todas começam com a mesma guarda. Ela não é redundante com o layout do
-- Next: o layout protege a TELA, isto protege o DADO — a função é chamável
-- pela API REST do Supabase por qualquer pessoa logada.
-- ##########################################################################

-- ==========================================================================
-- Custo e cota de IA
--
-- Responde a pergunta que nesta semana não tinha onde ser respondida: quanto
-- da cota diária já foi gasta, e quem gastou.
-- ==========================================================================
create or replace function admin_uso_ia()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return jsonb_build_object(
    -- Chamadas de IA em 24 h. Uma redação manuscrita gasta DUAS (transcrição e
    -- avaliação) e uma digitada gasta UMA, então contar partidas subestimaria.
    -- submissions.source é o que distingue as duas.
    'chamadas24h', (
      select coalesce(sum(case when s.source = 'typed' then 1 else 2 end), 0)
        from matches m join submissions s on s.match_id = m.id
       where m.submitted_at > now() - interval '24 hours'
    ),
    'redacoes24h', (
      select count(*) from matches where submitted_at > now() - interval '24 hours'
    ),
    'porDia', (
      select coalesce(jsonb_agg(d order by d->>'dia'), '[]'::jsonb) from (
        -- group by pela EXPRESSÃO, nunca por "1": a coluna 1 é o
        -- jsonb_build_object inteiro, e ele contém count(*) e sum(). Agrupar
        -- por ela dá "aggregate functions are not allowed in GROUP BY".
        select jsonb_build_object(
                 'dia', to_char(c.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
                 'correcoes', count(*),
                 'tokensIn', coalesce(sum(c.tokens_in), 0),
                 'tokensOut', coalesce(sum(c.tokens_out), 0)
               ) as d
          from corrections c
         where c.created_at > now() - interval '14 days'
         group by to_char(c.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
      ) x
    ),
    -- Quebra por modelo: é aqui que se vê o efeito de uma troca de modelo, e
    -- se alguma partida antiga ainda está sendo reprocessada no modelo velho.
    'porModelo', (
      select coalesce(jsonb_agg(d order by d->>'modelo'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'modelo', c.model,
                 'correcoes', count(*),
                 'tokensIn', coalesce(sum(c.tokens_in), 0),
                 'tokensOut', coalesce(sum(c.tokens_out), 0)
               ) as d
          from corrections c group by c.model
      ) x
    ),
    'topUsuarios', (
      select coalesce(jsonb_agg(d order by (d->>'correcoes')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'username', p.username,
                 'correcoes', count(*),
                 'tokens', coalesce(sum(c.tokens_in + c.tokens_out), 0)
               ) as d
          from corrections c
          join matches m on m.id = c.match_id
          join profiles p on p.id = m.user_id
         where c.created_at > now() - interval '30 days'
         group by p.username
         order by count(*) desc
         limit 10
      ) x
    ),
    'limiteDiario', config_int('limite_diario', 10)
  );
end;
$$;

-- ==========================================================================
-- Qualidade da correção
--
-- A comparação por rubric_version é o motivo desta tela existir: é como se
-- mede se uma mudança de rubrica aproximou ou afastou as notas da banca. Sem
-- ela, só dá para comparar duas telas na mão.
-- ==========================================================================
create or replace function admin_qualidade()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return jsonb_build_object(
    'porVersao', (
      select coalesce(jsonb_agg(d order by d->>'versao'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'versao', c.rubric_version,
                 'correcoes', count(*),
                 'media', round(avg(c.raw_score)),
                 'c1', round(avg(c.c1)), 'c2', round(avg(c.c2)),
                 'c3', round(avg(c.c3)), 'c4', round(avg(c.c4)),
                 'c5', round(avg(c.c5))
               ) as d
          from corrections c group by c.rubric_version
      ) x
    ),
    -- Distribuição por faixa de 200: mostra se o modelo está regredindo à
    -- média (tudo empilhado em 600-799) ou usando a escala.
    'faixas', (
      select coalesce(jsonb_agg(d order by (d->>'de')::int), '[]'::jsonb) from (
        select jsonb_build_object(
                 'de', (c.raw_score / 200) * 200,
                 'quantas', count(*)
               ) as d
          from corrections c group by (c.raw_score / 200) * 200
      ) x
    ),
    'contestadas', (select count(*) from submissions where disputed),
    'submissoes',  (select count(*) from submissions),
    'zeradas',     (select count(*) from corrections where raw_score = 0),
    -- Cinco competências idênticas é a assinatura de um modelo que não está
    -- diferenciando nada — vale olhar antes que vire nota entregue ao aluno.
    'suspeitas', (
      select count(*) from corrections
       where c1 = c2 and c2 = c3 and c3 = c4 and c4 = c5 and raw_score > 0
    ),
    'reprocessadas', (
      select count(*) from (
        select match_id from corrections group by match_id having count(*) > 1
      ) x
    )
  );
end;
$$;

-- ==========================================================================
-- Saúde do sistema
--
-- Os limiares repetem os de lib/matchStatus.ts (15 min de correção, 24 h de
-- pausa). Aqui é só EXIBIÇÃO — a materialização que vale continua em
-- iniciar_partida().
-- ==========================================================================
create or replace function admin_saude()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return jsonb_build_object(
    'porStatus', (
      select coalesce(jsonb_agg(d order by d->>'status'), '[]'::jsonb) from (
        select jsonb_build_object('status', m.status::text, 'quantas', count(*)) as d
          from matches m group by m.status
      ) x
    ),
    'travadasEmCorrecao', (
      select count(*) from matches
       where status = 'grading' and submitted_at is not null
         and now() > submitted_at + interval '15 minutes'
    ),
    'aguardandoFoto', (select count(*) from matches where status = 'needs_reupload'),
    'pausadas', (select count(*) from matches where paused_at is not null and status = 'in_progress'),
    -- Pausa perto do teto: some do índice one_active_match quando vencer, e o
    -- jogador perde a partida sem entender por quê.
    'pausasQuaseVencidas', (
      select count(*) from matches
       where paused_at is not null and status = 'in_progress'
         and now() > paused_at + interval '20 hours'
    ),
    'vencidasNaoMaterializadas', (
      select count(*) from matches
       where status = 'in_progress' and paused_at is null and now() > deadline
    ),
    'falhasCorrecao7d', (
      select count(*) from matches
       where status = 'grading_failed' and created_at > now() - interval '7 days'
    ),
    'fotoIlegivel30d', (
      select count(*) from submissions
       where created_at > now() - interval '30 days' and legibility is not null and legibility < 0.6
    ),
    'sinalizadas', (select count(*) from matches where flagged)
  );
end;
$$;

-- ==========================================================================
-- Uso, usuários e funil
-- ==========================================================================
create or replace function admin_uso()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return jsonb_build_object(
    'usuarios',  (select count(*) from profiles),
    'ativos7d',  (select count(distinct user_id) from matches where created_at > now() - interval '7 days'),
    'ativos30d', (select count(distinct user_id) from matches where created_at > now() - interval '30 days'),
    'cadastrosPorSemana', (
      select coalesce(jsonb_agg(d order by d->>'semana'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'semana', to_char(date_trunc('week', created_at), 'YYYY-MM-DD'),
                 'quantos', count(*)
               ) as d
          from profiles
         where created_at > now() - interval '12 weeks'
         group by date_trunc('week', created_at)
      ) x
    ),
    -- Funil: cada degrau perdido é uma pessoa que começou e não terminou.
    'funil', jsonb_build_object(
      'iniciadas', (select count(*) from matches where status <> 'cancelled'),
      'enviadas',  (select count(*) from matches where submitted_at is not null),
      'corrigidas',(select count(distinct match_id) from corrections)
    ),
    'livreVsValendo', jsonb_build_object(
      'livre',   (select count(*) from matches where is_free),
      'valendo', (select count(*) from matches where not is_free)
    ),
    'porDificuldade', (
      select coalesce(jsonb_agg(d order by d->>'id'), '[]'::jsonb) from (
        select jsonb_build_object('id', m.difficulty, 'quantas', count(*)) as d
          from matches m where not m.is_free group by m.difficulty
      ) x
    ),
    'dicasAbertas', (select count(*) from match_hints),
    'temasCustom', (select count(*) from themes where created_by is not null)
  );
end;
$$;

-- ==========================================================================
-- Curadoria de temas
--
-- `nunca_jogado` é a lista que diz onde o acervo está parado, e `queimado_por`
-- diz quantos usuários já não podem mais receber aquele tema na roleta.
-- Treino livre não entra na conta, pelo mesmo motivo de sortear_tema.
-- ==========================================================================
create or replace function admin_temas()
returns table (
  id uuid, title text, active boolean, is_custom boolean,
  queimado_por bigint, corrigidas bigint, nota_media numeric, dicas bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return query
    select t.id, t.title, t.active, (t.created_by is not null),
           (select count(distinct m.user_id) from matches m
             where m.theme_id = t.id and not m.is_free and m.status <> 'cancelled'),
           (select count(*) from matches m join corrections c on c.match_id = m.id
             where m.theme_id = t.id),
           (select round(avg(c.raw_score)) from matches m join corrections c on c.match_id = m.id
             where m.theme_id = t.id),
           (select count(*) from hints h where h.theme_id = t.id)
      from themes t
     order by t.created_by is not null, t.active desc, t.title;
end;
$$;

-- ==========================================================================
-- Redações — lista e detalhe
--
-- O detalhe grava em admin_access_log NA MESMA TRANSAÇÃO em que devolve o
-- texto, como abrir_dica() faz com a cobrança: não existe caminho que entregue
-- a redação de um aluno sem deixar rastro de quem leu.
-- ==========================================================================
create or replace function admin_partidas(
  p_filtro text default 'todas',
  p_limite integer default 50
)
returns table (
  id uuid, username text, tema text, status text, is_free boolean,
  criada_em timestamptz, nota integer, contestada boolean, sinalizada boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return query
    select m.id, p.username, t.title, m.status::text, m.is_free, m.created_at,
           c.raw_score, coalesce(s.disputed, false), m.flagged
      from matches m
      join profiles p on p.id = m.user_id
      join themes t on t.id = m.theme_id
      left join submissions s on s.match_id = m.id
      left join lateral (
        select raw_score from corrections where match_id = m.id
         order by attempt desc limit 1
      ) c on true
     where case p_filtro
             -- coalesce porque submissions vem de LEFT JOIN: sem ele,
             -- `NULL or false or false` dá NULL, e a linha some do filtro em
             -- vez de aparecer. Partida sem envio nenhum é justamente uma das
             -- que se quer ver em "com problema".
             when 'problemas' then (coalesce(s.disputed, false) or m.flagged
                                    or m.status in ('grading_failed','needs_reupload'))
             when 'corrigidas' then c.raw_score is not null
             else true
           end
     order by m.created_at desc
     limit least(p_limite, 200);
end;
$$;

create or replace function admin_partida(p_match_id uuid)
returns jsonb
language plpgsql
security definer      -- NÃO é stable: escreve no log de acesso
set search_path = public
as $$
declare
  v jsonb;
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  select jsonb_build_object(
           'id', m.id,
           'username', p.username,
           'tema', t.title,
           'enunciado', t.statement,
           'temaProprio', t.created_by is not null,
           'status', m.status::text,
           'isFree', m.is_free,
           'criadaEm', m.created_at,
           'enviadaEm', m.submitted_at,
           'segundosGastos', m.elapsed_seconds,
           'duracao', m.duration_seconds,
           'xpFinal', m.xp_final,
           'sinalizada', m.flagged,
           'origem', s.source,
           'legibilidade', s.legibility,
           'contestada', coalesce(s.disputed, false),
           'transcricao', s.transcript,
           'correcoes', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'tentativa', c.attempt, 'c1', c.c1, 'c2', c.c2, 'c3', c.c3,
                      'c4', c.c4, 'c5', c.c5, 'total', c.raw_score,
                      'rubrica', c.rubric_version, 'modelo', c.model,
                      'tokens', coalesce(c.tokens_in, 0) + coalesce(c.tokens_out, 0),
                      'feedback', c.feedback, 'criadaEm', c.created_at
                    ) order by c.attempt desc), '[]'::jsonb)
               from corrections c where c.match_id = m.id
           ),
           'dicasAbertas', (
             select count(*) from match_hints mh where mh.match_id = m.id
           )
         )
    into v
    from matches m
    join profiles p on p.id = m.user_id
    join themes t on t.id = m.theme_id
    left join submissions s on s.match_id = m.id
   where m.id = p_match_id;

  if v is null then raise exception 'partida não encontrada'; end if;

  -- O registro vem antes do return, na mesma transação. Se o insert falhar, o
  -- texto não é entregue — que é exatamente a garantia desejada.
  insert into admin_access_log (admin_id, match_id) values (auth.uid(), p_match_id);

  return v;
end;
$$;

create or replace function admin_acessos(p_limite integer default 50)
returns table (admin text, match_id uuid, aluno text, lido_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  return query
    select a.username, l.match_id, dono.username, l.lido_em
      from admin_access_log l
      join profiles a on a.id = l.admin_id
      join matches m on m.id = l.match_id
      join profiles dono on dono.id = m.user_id
     order by l.lido_em desc
     limit least(p_limite, 200);
end;
$$;

-- ##########################################################################
-- GESTÃO — escrita
--
-- Toda escrita passa por função com a mesma guarda. Nenhuma delas toca em
-- conta de usuário: promover admin, apagar partida e mexer em XP alheio
-- ficaram deliberadamente de fora.
-- ##########################################################################

create or replace function admin_set_config(p_chave text, p_valor integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;
  -- Piso 1: zero travaria o jogo inteiro sem nenhum aviso, e o painel não deve
  -- oferecer um jeito silencioso de desligar o produto.
  if p_chave = 'limite_diario' and (p_valor < 1 or p_valor > 500) then
    raise exception 'o limite diário aceita de 1 a 500';
  end if;

  update config set valor = p_valor, updated_at = now() where chave = p_chave;
  if not found then raise exception 'configuração desconhecida: %', p_chave; end if;
  return p_valor;
end;
$$;

/**
 * Cria ou atualiza tema do catálogo.
 *
 * p_id nulo cria. Tema de treino livre (created_by não nulo) é recusado: ele é
 * escrita pessoal do jogador, não conteúdo editorial, e editá-lo mudaria a
 * proposta de uma partida que já aconteceu.
 */
-- Campo nulo em UPDATE quer dizer "não mexe". Sem isso, ativar um tema exigiria
-- reenviar o enunciado inteiro, e um bug de tela apagaria a proposta ao mudar
-- só o interruptor.
create or replace function admin_upsert_tema(
  p_id uuid,
  p_title text default null,
  p_statement text default null,
  p_supporting_texts jsonb default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;

  if p_id is null then
    -- Criando: título e enunciado são obrigatórios.
    if length(btrim(coalesce(p_title, ''))) < 10 then
      raise exception 'o título precisa de ao menos 10 caracteres';
    end if;
    if length(btrim(coalesce(p_statement, ''))) < 40 then
      raise exception 'o enunciado precisa de ao menos 40 caracteres';
    end if;

    insert into themes (title, statement, supporting_texts, active)
    values (btrim(p_title), btrim(p_statement),
            coalesce(p_supporting_texts, '[]'::jsonb), coalesce(p_active, true))
    returning id into v_id;
    return v_id;
  end if;

  -- Tema de treino livre é escrita pessoal do jogador, não conteúdo editorial:
  -- editá-lo mudaria a proposta de uma partida que já aconteceu.
  if exists (select 1 from themes where id = p_id and created_by is not null) then
    raise exception 'tema de treino livre não é editável pelo painel';
  end if;

  if p_title is not null and length(btrim(p_title)) < 10 then
    raise exception 'o título precisa de ao menos 10 caracteres';
  end if;
  if p_statement is not null and length(btrim(p_statement)) < 40 then
    raise exception 'o enunciado precisa de ao menos 40 caracteres';
  end if;

  update themes
     set title            = coalesce(btrim(p_title), title),
         statement        = coalesce(btrim(p_statement), statement),
         supporting_texts = coalesce(p_supporting_texts, supporting_texts),
         active           = coalesce(p_active, active)
   where id = p_id
   returning id into v_id;

  if v_id is null then raise exception 'tema não encontrado'; end if;
  return v_id;
end;
$$;

/**
 * Dicas de um tema — leitura e escrita.
 *
 * A tabela hints continua SEM policy de leitura. Criar uma para o painel
 * entregaria o conteúdo de todas as dicas a qualquer jogador pela API, e a
 * penalidade em XP viraria enfeite. O admin lê por aqui, security definer.
 */
create or replace function admin_dicas(p_theme_id uuid)
returns table (id uuid, kind text, content text, cost_xp integer, order_index smallint, aberturas bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;
  return query
    select h.id, h.kind, h.content, h.cost_xp, h.order_index,
           (select count(*) from match_hints mh where mh.hint_id = h.id)
      from hints h where h.theme_id = p_theme_id order by h.order_index;
end;
$$;

create or replace function admin_upsert_dica(
  p_id uuid, p_theme_id uuid, p_kind text, p_content text,
  p_cost_xp integer, p_order_index smallint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;
  if p_kind not in ('repertorio','tese','estrutura') then
    raise exception 'tipo de dica inválido: %', p_kind;
  end if;
  if length(btrim(coalesce(p_content, ''))) < 20 then
    raise exception 'a dica precisa de ao menos 20 caracteres';
  end if;

  if p_id is null then
    insert into hints (theme_id, kind, content, cost_xp, order_index)
    values (p_theme_id, p_kind, btrim(p_content), p_cost_xp, p_order_index)
    on conflict (theme_id, order_index) do update
      set kind = excluded.kind, content = excluded.content, cost_xp = excluded.cost_xp
    returning id into v_id;
  else
    update hints set kind = p_kind, content = btrim(p_content),
                     cost_xp = p_cost_xp, order_index = p_order_index
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'dica não encontrada'; end if;
  end if;
  return v_id;
end;
$$;

/**
 * Rebalanceia uma dificuldade.
 *
 * Não reescreve o passado: matches grava duration_seconds no início e
 * corrections lê o multiplicador no momento da correção, então partidas
 * antigas continuam explicáveis pelos números que tinham.
 */
create or replace function admin_set_dificuldade(
  p_id text, p_duration_seconds integer, p_xp_multiplier numeric, p_min_xp integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not sou_admin() then raise exception 'não autorizado'; end if;
  if p_duration_seconds < 300 or p_duration_seconds > 14400 then
    raise exception 'a duração aceita de 5 minutos a 4 horas';
  end if;
  if p_xp_multiplier <= 0 or p_xp_multiplier > 5 then
    raise exception 'o multiplicador aceita de 0,01 a 5,00';
  end if;
  if p_min_xp < 0 then raise exception 'o XP de desbloqueio não pode ser negativo'; end if;

  update difficulties
     set duration_seconds = p_duration_seconds,
         xp_multiplier = p_xp_multiplier,
         min_xp = p_min_xp
   where id = p_id;
  if not found then raise exception 'dificuldade não encontrada: %', p_id; end if;
  return p_id;
end;
$$;

-- ==========================================================================
-- 4) RESULTADO — leia estas linhas.
-- ==========================================================================
select
  (select count(*) from information_schema.columns
    where table_name = 'profiles' and column_name = 'is_admin')
    as coluna_is_admin,                    -- tem de ser 1
  (select count(*) from information_schema.column_privileges
    where table_name = 'profiles' and column_name = 'is_admin'
      and grantee = 'authenticated' and privilege_type = 'UPDATE')
    as usuario_pode_editar_is_admin,       -- tem de ser 0
  (select count(*) from information_schema.column_privileges
    where table_name = 'profiles' and column_name = 'username'
      and grantee = 'authenticated' and privilege_type = 'UPDATE')
    as usuario_pode_editar_username,       -- tem de ser 1
  (select valor from config where chave = 'limite_diario')
    as limite_diario,                      -- tem de ser 10
  (select count(*) from profiles where is_admin) as admins;   -- 0 na primeira vez

-- ==========================================================================
-- 5) VOCÊ AINDA NÃO É ADMIN. Rode a linha abaixo, uma vez.
--
-- Troque pelo seu e-mail. Não existe tela para isso de propósito: promover
-- admin pela interface exigiria um admin para começar, e o primeiro tem de
-- nascer de fora.
--
--   update profiles set is_admin = true
--    where id = (select id from auth.users where email = 'voce@exemplo.com');
--
-- Confira com:  select username, is_admin from profiles where is_admin;
-- ==========================================================================
