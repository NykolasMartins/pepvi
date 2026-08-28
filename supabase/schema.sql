-- PEPVI — Fase 1: schema inicial.
-- Rodar no SQL Editor do Supabase. Idempotente: pode rodar de novo.
--
-- Escopo: profiles, themes, matches, submissions, corrections + bucket essays.
-- As tabelas hints e match_hints entram na Fase 3.

-- ==========================================================================
-- profiles
-- ==========================================================================
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  -- Mantida por compatibilidade, mas NÃO usada: o XP total é somado de
  -- matches.xp_final na leitura. Contador denormalizado seria uma segunda
  -- verdade, e dessincronizaria no primeiro reprocessamento de correção.
  total_xp   integer not null default 0,
  created_at timestamptz not null default now()
);

-- O profile nasce junto com o usuário, por trigger.
--
-- Em código da aplicação isto seria uma etapa que pode falhar ou ser esquecida
-- em algum caminho de cadastro, e matches.user_id tem FK para profiles: sem a
-- linha, a primeira partida quebra. No banco não tem como esquecer.
create or replace function criar_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    -- Nome visível provisório: parte local do e-mail, com sufixo se colidir.
    coalesce(
      nullif(split_part(new.email, '@', 1), ''),
      'jogador'
    ) || '-' || substring(new.id::text from 1 for 4)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function criar_profile();

-- ==========================================================================
-- themes
-- ==========================================================================
create table if not exists themes (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  statement        text not null,                        -- enunciado da proposta
  supporting_texts jsonb not null default '[]'::jsonb,   -- [{source, content}]
  source_year      integer,
  difficulty       smallint check (difficulty between 1 and 5),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ==========================================================================
-- matches
-- ==========================================================================
do $$ begin
  create type match_status as enum (
    'in_progress','submitted','grading','needs_reupload',
    'graded','expired','grading_failed','cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists matches (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references profiles(id) on delete cascade,
  theme_id uuid not null references themes(id),
  status   match_status not null default 'in_progress',

  -- Tempo: única fonte de verdade do jogo.
  -- started_at vem do relógio do BANCO, nunca do Node e jamais do navegador.
  started_at       timestamptz not null default now(),
  duration_seconds integer not null default 5400,        -- 90 min
  -- Era coluna gerada, mas o Postgres recusa: timestamptz + interval é STABLE,
  -- não IMMUTABLE (o resultado depende do TimeZone da sessão por causa de DST),
  -- e generated stored exige immutable. Erro 42P17.
  --
  -- Agora é coluna normal, preenchida por iniciar_partida(). Sem default de
  -- propósito: NOT NULL faz qualquer insert que esqueça o deadline falhar alto,
  -- em vez de criar partida sem prazo.
  deadline         timestamptz not null,
  submitted_at     timestamptz,
  elapsed_seconds  integer,

  -- Código de 4 caracteres que o aluno escreve no canto da folha (PRD 4.8).
  anti_replay_code text not null default upper(substring(md5(random()::text) from 1 for 4)),
  is_replay        boolean not null default false,       -- pool de temas esgotado
  flagged          boolean not null default false,

  -- Pontuação: preenchida no fechamento, sempre pelo servidor (Fase 3).
  raw_score       integer check (raw_score between 0 and 1000),
  hint_penalty    integer,
  speed_bonus     integer,
  xp_final        integer,
  scoring_version text,

  created_at timestamptz not null default now()
);

-- Uma partida ativa por usuário. É esta restrição que impede abrir várias
-- partidas para escolher tema — não um if na aplicação.
create unique index if not exists one_active_match
  on matches (user_id)
  where status in ('in_progress','submitted','grading','needs_reupload');

-- Sorteio sem repetição e histórico.
create index if not exists matches_user_theme on matches (user_id, theme_id);
create index if not exists matches_user_recent on matches (user_id, created_at desc);

-- ==========================================================================
-- Sorteio sem repetição (PRD 4.6)
--
-- Não existe tabela "temas jogados": a informação já está em matches, e uma
-- tabela espelho seria uma segunda verdade capaz de dessincronizar — e se
-- dessincronizar, o usuário recebe tema repetido, que é justamente a regra
-- obrigatória do produto.
-- ==========================================================================
create or replace function sortear_tema(p_user_id uuid default auth.uid())
returns table (theme_id uuid, is_replay boolean)
language plpgsql
as $$
begin
  -- 1) tema inédito
  return query
    select t.id, false
    from themes t
    where t.active
      and not exists (
        select 1 from matches m
        where m.user_id = p_user_id
          and m.theme_id = t.id
          and m.status <> 'cancelled'   -- partida expirada QUEIMA o tema (PRD 4.6)
      )
    order by random()
    limit 1;

  if found then return; end if;

  -- 2) pool esgotado: libera repetição, sinalizada para valer metade do XP
  return query
    select t.id, true
    from themes t
    where t.active
    order by random()
    limit 1;
end;
$$;

-- ==========================================================================
-- Início de partida — iniciar_partida()
--
-- A definição NÃO está aqui de propósito. Ela vive em um único lugar:
--
--     supabase/fix-game-loop.sql
--
-- Havia uma cópia antiga neste arquivo. Com duas definições da mesma função no
-- repositório, quem venceu passou a depender da ORDEM em que os arquivos foram
-- executados: rodar o fix e depois "rodar o schema por segurança" reinstalava
-- a versão antiga e o game loop travava de novo. Foi o que aconteceu.
--
-- Uma função, um arquivo. Rode fix-game-loop.sql depois deste.
-- ==========================================================================

-- ==========================================================================
-- RLS
--
-- Na Fase 1 as rotas do servidor usam a service_role key, que ignora RLS —
-- ainda não há sessão de usuário. As políticas ficam escritas e corretas
-- desde já para que a entrada do Supabase Auth não precise mexer no schema.
-- ==========================================================================
alter table profiles enable row level security;
alter table themes   enable row level security;
alter table matches  enable row level security;

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists themes_read on themes;
create policy themes_read on themes
  for select using (true);

drop policy if exists matches_self on matches;
create policy matches_self on matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================================================
-- Seed de temas
--
-- NÃO está aqui. Vive em um único lugar:
--
--     supabase/seed-temas.sql        (20 temas, idempotente por título)
--
-- O seed antigo tinha 3 temas e um `where not exists (select 1 from themes)`,
-- que só insere com a tabela vazia — acrescentar tema exigia apagar tudo.
-- ==========================================================================

-- ==========================================================================
-- Usuário de desenvolvimento
--
-- Crie um usuário em Authentication > Users > Add user no painel do Supabase,
-- copie o UUID dele, descomente a linha abaixo trocando o UUID, e ponha o
-- mesmo valor em DEV_USER_ID no .env.local.
--
-- insert into profiles (id, username) values ('COLE-O-UUID-AQUI', 'dev')
--   on conflict (id) do nothing;
-- ==========================================================================

-- ##########################################################################
-- FASE 1 — parte 2: envio, storage e correção
-- Este arquivo é idempotente: pode rodar inteiro de novo sem perder dados.
-- ##########################################################################

-- ==========================================================================
-- submissions — as fotos e (na Fase 2) a transcrição
-- ==========================================================================
create table if not exists submissions (
  id           uuid primary key default gen_random_uuid(),
  -- UNIQUE: duplo clique em "enviar" não gera duas submissões.
  match_id     uuid not null unique references matches(id) on delete cascade,
  image_paths  text[] not null,
  transcript   text,          -- Fase 2
  legibility   real,          -- Fase 2
  vision_model text,          -- Fase 2
  disputed     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ==========================================================================
-- corrections — notas por competência
-- attempt em vez de unique(match_id): reprocessar preserva a tentativa
-- anterior. Sem isso, uma contestação apaga a evidência da contestação.
-- ==========================================================================
create table if not exists corrections (
  id       uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  attempt  smallint not null default 1,
  c1 smallint not null check (c1 between 0 and 200),
  c2 smallint not null check (c2 between 0 and 200),
  c3 smallint not null check (c3 between 0 and 200),
  c4 smallint not null check (c4 between 0 and 200),
  c5 smallint not null check (c5 between 0 and 200),
  -- Soma de inteiros é IMMUTABLE, então aqui a coluna gerada funciona.
  raw_score      integer generated always as (c1 + c2 + c3 + c4 + c5) stored,
  feedback       jsonb not null default '{}'::jsonb,
  rubric_version text not null,
  model          text not null,
  tokens_in      integer,
  tokens_out     integer,
  created_at     timestamptz not null default now(),
  unique (match_id, attempt)
);

create index if not exists corrections_match on corrections (match_id, attempt desc);

-- Modo de entrega. 'typed' pula a etapa de visão inteira: não há caligrafia
-- para ler, então também não há gate de legibilidade nem código na folha.
alter table submissions
  add column if not exists source text not null default 'handwritten'
    check (source in ('handwritten','typed'));

-- Redação digitada não tem foto. O array vazio é o estado válido dela.
alter table submissions alter column image_paths set default '{}';

alter table submissions enable row level security;
alter table corrections enable row level security;

drop policy if exists submissions_self on submissions;
create policy submissions_self on submissions
  for all using (
    exists (select 1 from matches m where m.id = match_id and m.user_id = auth.uid())
  );

drop policy if exists corrections_self on corrections;
create policy corrections_self on corrections
  for all using (
    exists (select 1 from matches m where m.id = match_id and m.user_id = auth.uid())
  );

-- ==========================================================================
-- Bucket das fotos
--
-- Privado. O upload usa signed upload URL, que não exige policy em
-- storage.objects — o token na URL é a autorização.
-- ==========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('essays', 'essays', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ==========================================================================
-- Envio da redação — enviar_partida()
--
-- Uma definição só, mais abaixo no bloco da Fase 2 (a que aceita reenvio após
-- needs_reupload). A cópia antiga que existia aqui foi removida: duas
-- definições da mesma função tornam o resultado dependente da ordem de
-- execução, que é como a iniciar_partida antiga voltou ao banco três vezes.
-- ==========================================================================
-- ##########################################################################
-- FASE 2 — correção real
-- ##########################################################################

-- ==========================================================================
-- enviar_partida, versão 2: aceita reenvio depois de needs_reupload.
--
-- Foto ilegível não pode consumir a partida. O relógio já parou no primeiro
-- envio, então o reenvio troca as fotos e devolve a partida para a fila de
-- correção SEM recalcular elapsed_seconds — punir problema de câmera seria
-- punir a coisa errada, e reabrir o relógio seria um buraco.
-- ==========================================================================
-- p_user_id foi REMOVIDO de propósito: id de usuário vindo do cliente é dado
-- não confiável. auth.uid() vem do JWT validado pelo Postgres.
create or replace function enviar_partida(
  p_match_id       uuid,
  p_image_paths    text[] default '{}',
  p_transcript     text   default null,
  p_grace_seconds  integer default 120
)
returns table (status match_status, elapsed_seconds integer, late boolean)
language plpgsql
as $$
declare
  m         record;
  v_now     timestamptz := now();
  v_elapsed integer;
  v_late    boolean;
  v_status  match_status;
  v_fotos   integer := coalesce(array_length(p_image_paths, 1), 0);
  v_digitada boolean := p_transcript is not null and length(btrim(p_transcript)) > 0;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'não autenticado';
  end if;

  -- Uma das duas formas de entrega, nunca as duas nem nenhuma.
  if v_fotos = 0 and not v_digitada then
    raise exception 'envie uma foto ou o texto digitado';
  end if;
  if v_fotos > 0 and v_digitada then
    raise exception 'escolha um modo: foto ou texto digitado';
  end if;
  if v_fotos > 3 then
    raise exception 'máximo de 3 fotos';
  end if;

  select * into m from matches
   where id = p_match_id and user_id = v_user_id
     for update;

  if not found then
    raise exception 'partida não encontrada';
  end if;

  -- Reenvio após foto ilegível: volta para grading, tempo intacto.
  if m.status = 'needs_reupload' then
    update submissions
       set image_paths = p_image_paths,
           transcript = case when v_digitada then p_transcript else null end,
           source = case when v_digitada then 'typed' else 'handwritten' end,
           legibility = null,
           vision_model = null
     where match_id = p_match_id;

    update matches set status = 'grading' where id = p_match_id;

    return query select 'grading'::match_status, m.elapsed_seconds, false;
    return;
  end if;

  -- Idempotência: reenvio comum NÃO remexe no tempo já gravado.
  if m.submitted_at is not null then
    update submissions set image_paths = p_image_paths where match_id = p_match_id;
    return query select m.status, m.elapsed_seconds, (m.status = 'expired');
    return;
  end if;

  if m.status <> 'in_progress' then
    raise exception 'partida não está em andamento (status: %)', m.status;
  end if;

  v_elapsed := floor(extract(epoch from (v_now - m.started_at)))::integer;

  -- A carência existe porque latência de rede não é trapaça: quem apertou
  -- enviar aos 89:58 não pode perder a partida por causa de RTT.
  v_late   := v_elapsed > m.duration_seconds + p_grace_seconds;
  v_status := case when v_late then 'expired'::match_status else 'grading'::match_status end;

  update matches
     set submitted_at    = v_now,
         elapsed_seconds = v_elapsed,
         status          = v_status
   where id = p_match_id;

  insert into submissions (match_id, image_paths, transcript, source)
  values (
    p_match_id,
    p_image_paths,
    case when v_digitada then p_transcript else null end,
    case when v_digitada then 'typed' else 'handwritten' end
  )
  on conflict (match_id) do update
    set image_paths = excluded.image_paths,
        transcript  = excluded.transcript,
        source      = excluded.source;

  return query select v_status, v_elapsed, v_late;
end;
$$;

-- A assinatura mudou (ganhou p_transcript). A antiga de 4 argumentos precisa
-- sair, senão o PostgREST pode continuar resolvendo para ela — foi assim que a
-- iniciar_partida antiga voltou ao banco três vezes.
-- Assinaturas antigas precisam sair, senão o PostgREST pode continuar
-- resolvendo para uma delas.
drop function if exists enviar_partida(uuid, uuid, text[], integer);
drop function if exists enviar_partida(uuid, uuid, text[], text, integer);

-- ==========================================================================
-- Status efetivo (PRD 4.5 e 6.5)
--
-- Aqui existiu uma VIEW matches_view calculando effective_status. Foi removida:
-- ela só derivava estado a partir de status, deadline e submitted_at — colunas
-- que a própria consulta já traz. Uma view para isso custava uma migração e uma
-- dependência do cache de schema do PostgREST sem nada em troca.
--
-- A derivação vive em lib/matchStatus.ts, com autoteste. A decisão que vale
-- (se o envio entrou no prazo) continua em enviar_partida(), contra o relógio
-- do banco.
--
-- Se você já criou a view, pode removê-la:
--   drop view if exists matches_view;
-- ==========================================================================

-- ##########################################################################
-- CORREÇÃO — o paradoxo entre PRD 4.5 e o índice único
--
-- A versão final de iniciar_partida() vive em supabase/fix-game-loop.sql, que
-- faz DROP explícito antes do CREATE. Motivo: "create or replace" substitui uma
-- assinatura só, e se houver duas o PostgREST pode seguir chamando a antiga —
-- foi o que fez o erro reaparecer depois de "aplicar a correção".
--
-- Rode fix-game-loop.sql DEPOIS deste arquivo.
-- ##########################################################################

-- ##########################################################################
-- FASE 3 — dicas com penalidade (PRD 4.7)
-- ##########################################################################

create table if not exists hints (
  id          uuid primary key default gen_random_uuid(),
  theme_id    uuid not null references themes(id) on delete cascade,
  kind        text not null check (kind in ('repertorio','tese','estrutura')),
  content     text not null,
  cost_xp     integer not null default 25,   -- por dica: permite dica "cara"
  order_index smallint not null default 0
);

create index if not exists hints_theme on hints (theme_id, order_index);
-- Idempotência do seed.
create unique index if not exists hints_theme_order on hints (theme_id, order_index);

create table if not exists match_hints (
  match_id  uuid not null references matches(id) on delete cascade,
  hint_id   uuid not null references hints(id) on delete cascade,
  opened_at timestamptz not null default now(),
  -- Snapshot: rebalancear o preço da dica não pode reescrever a pontuação de
  -- partidas antigas.
  cost_xp   integer not null,
  -- PK composta: reabrir a MESMA dica não cobra duas vezes. A regra é uma
  -- restrição do banco, não um if na aplicação.
  primary key (match_id, hint_id)
);

-- ==========================================================================
-- RLS — a parte que faz a penalidade existir de verdade
--
-- hints tem RLS ligada e NENHUMA política de leitura. Nem anon nem
-- authenticated conseguem ler a tabela pela API, em nenhuma coluna.
--
-- Isso é deliberado. O erro clássico aqui é mandar as dicas embutidas no
-- payload do tema e esconder com CSS: o DevTools entrega tudo de graça e o
-- sistema de penalidade passa a ser enfeite. O conteúdo só sai pelas duas
-- funções abaixo, e uma delas grava o log antes de devolver.
-- ==========================================================================
alter table hints       enable row level security;
alter table match_hints enable row level security;

drop policy if exists match_hints_self on match_hints;
create policy match_hints_self on match_hints
  for select using (
    exists (select 1 from matches m where m.id = match_id and m.user_id = auth.uid())
  );

-- ==========================================================================
-- Listar as dicas de uma partida.
--
-- Devolve metadados sempre, e o CONTEÚDO apenas das já abertas — para que dar
-- F5 não faça o usuário perder o que já pagou.
-- ==========================================================================
create or replace function dicas_da_partida(p_match_id uuid)
returns table (
  id uuid,
  kind text,
  cost_xp integer,
  order_index smallint,
  opened boolean,
  content text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_theme_id uuid;
begin
  select m.theme_id into v_theme_id
    from matches m
   where m.id = p_match_id and m.user_id = auth.uid();

  if v_theme_id is null then
    raise exception 'partida não encontrada';
  end if;

  return query
    select h.id,
           h.kind,
           h.cost_xp,
           h.order_index,
           (mh.hint_id is not null) as opened,
           case when mh.hint_id is not null then h.content else null end as content
      from hints h
      left join match_hints mh
             on mh.hint_id = h.id and mh.match_id = p_match_id
     where h.theme_id = v_theme_id
     order by h.order_index;
end;
$$;

-- ==========================================================================
-- Abrir uma dica: grava o log e SÓ ENTÃO devolve o conteúdo.
--
-- As duas coisas na mesma transação. Não existe caminho que entregue o texto
-- sem cobrar, nem que cobre sem entregar.
-- ==========================================================================
create or replace function abrir_dica(p_hint_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_match_id uuid;
  v_status   match_status;
  v_deadline timestamptz;
  v_cost     integer;
  v_content  text;
begin
  if v_user_id is null then
    raise exception 'não autenticado';
  end if;

  -- A dica pertence ao tema da partida em andamento deste usuário?
  select m.id, m.status, m.deadline, h.cost_xp, h.content
    into v_match_id, v_status, v_deadline, v_cost, v_content
    from hints h
    join matches m on m.theme_id = h.theme_id
   where h.id = p_hint_id
     and m.user_id = v_user_id
     and m.status = 'in_progress'
   limit 1;

  if v_match_id is null then
    raise exception 'dica indisponível para esta partida';
  end if;

  -- Depois do prazo não se abre dica: seria pagar penalidade sem poder usar.
  if now() > v_deadline then
    raise exception 'o tempo desta partida já acabou';
  end if;

  insert into match_hints (match_id, hint_id, cost_xp)
  values (v_match_id, p_hint_id, v_cost)
  on conflict (match_id, hint_id) do nothing;   -- reabrir não cobra de novo

  return v_content;
end;
$$;

-- ==========================================================================
-- Penalidade acumulada da partida.
-- Soma os snapshots gravados em match_hints — nunca o preço atual da dica.
-- ==========================================================================
create or replace function penalidade_dicas(p_match_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_xp), 0)::integer
    from match_hints
   where match_id = p_match_id;
$$;

-- ##########################################################################
-- Correção em duas requisições
--
-- Transcrição e avaliação somadas passam de 60s com frequência, e função
-- serverless tem teto. Cada etapa virou uma requisição.
--
-- vision_meta guarda o que a etapa 1 produz e a etapa 2 precisa — contagem de
-- ilegíveis, se o código estava na folha, tokens gastos. Sem persistir, esses
-- dados morriam no fim da primeira requisição.
-- ##########################################################################
alter table submissions add column if not exists vision_meta jsonb;
