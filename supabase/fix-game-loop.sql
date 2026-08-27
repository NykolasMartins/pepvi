-- PEPVI — corrige o travamento do game loop.
--
-- Rode ESTE arquivo inteiro no SQL Editor do Supabase.
-- A última consulta imprime o resultado: leia antes de testar a roleta.
--
-- Diferente da tentativa anterior: DROP explícito antes do CREATE. Se existir
-- mais de uma assinatura de iniciar_partida no banco, "create or replace"
-- substitui apenas uma e o PostgREST pode continuar chamando a outra — o que
-- explica o erro reaparecer depois de "aplicar a correção".

-- ==========================================================================
-- 1) Remove TODAS as assinaturas conhecidas.
-- ==========================================================================
drop function if exists iniciar_partida(uuid, integer);
drop function if exists iniciar_partida(uuid);
drop function if exists iniciar_partida(integer);
drop function if exists iniciar_partida(text);

-- ==========================================================================
-- 2) Cria a versão correta.
-- ==========================================================================
-- p_user_id foi REMOVIDO: id de usuário vindo do cliente é dado não confiável.
-- auth.uid() vem do JWT que o Postgres já validou.
-- A duração agora vem da dificuldade, não do cliente. Deixar o cliente
-- escolher os segundos seria deixá-lo escolher a própria dificuldade — e o
-- bônus de velocidade é calculado sobre ela.
create function iniciar_partida(
  p_difficulty text default 'padrao'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_theme_id   uuid;
  v_is_replay  boolean;
  v_match_id   uuid;
  v_started_at timestamptz := now();
  p_user_id    uuid := auth.uid();
  v_dur        integer;
  v_min_xp     integer;
begin
  if p_user_id is null then
    raise exception 'não autenticado';
  end if;

  -- Desbloqueio validado AQUI, no servidor. O cliente lista as dificuldades e
  -- desenha o cadeado, mas quem decide se pode é o banco: um POST forjado
  -- pedindo 'relampago' sem XP tem de falhar.
  select duration_seconds, min_xp into v_dur, v_min_xp
    from difficulties where id = p_difficulty;

  if v_dur is null then
    raise exception 'dificuldade inválida: %', p_difficulty;
  end if;

  if xp_total(p_user_id) < v_min_xp then
    raise exception 'dificuldade % exige % XP', p_difficulty, v_min_xp;
  end if;

  -- Serializa por usuário até o fim da transação. É o que torna a sequência
  -- "verifica, depois insere" livre de corrida — dois cliques simultâneos não
  -- criam duas partidas. Solta sozinho no commit.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- ---- Materializa o que o relógio já decidiu -----------------------------
  -- Derivar status na leitura (PRD 4.5) serve para EXIBIR. Não serve quando
  -- uma restrição FÍSICA lê a coluna: o índice parcial one_active_match filtra
  -- por status, então a partida vencida que continua 'in_progress' na coluna
  -- bloqueia toda partida nova. Manter em sintonia com lib/matchStatus.ts.
  update matches
     set status = 'expired'
   where user_id = p_user_id
     and status = 'in_progress'
     and now() > deadline;

  -- Correção travada: mesmo problema, outro status. Os 15 min também estão em
  -- GRADING_TIMEOUT_MS, em lib/matchStatus.ts.
  update matches
     set status = 'grading_failed'
   where user_id = p_user_id
     and status = 'grading'
     and submitted_at is not null
     and now() > submitted_at + interval '15 minutes';

  -- ---- Existe partida realmente ativa? Devolve ela ------------------------
  -- Esta verificação vivia em TypeScript e rodava ANTES da materialização:
  -- enxergava a partida fantasma e redirecionava para ela. Agora está na mesma
  -- transação do insert.
  select id into v_match_id
    from matches
   where user_id = p_user_id
     and status in ('in_progress','submitted','grading','needs_reupload')
   order by created_at desc
   limit 1;

  if v_match_id is not null then
    return v_match_id;
  end if;

  -- ---- Sorteia tema inédito e cria ---------------------------------------
  select theme_id, is_replay into v_theme_id, v_is_replay
  from sortear_tema(p_user_id);

  if v_theme_id is null then
    raise exception 'nenhum tema ativo cadastrado';
  end if;

  insert into matches (
    user_id, theme_id, duration_seconds, is_replay, started_at, deadline, difficulty
  )
  values (
    p_user_id, v_theme_id, v_dur, v_is_replay,
    v_started_at,
    v_started_at + make_interval(secs => v_dur),
    p_difficulty
  )
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- ==========================================================================
-- 3) Limpa o estado atual, para o caso de já haver partida fantasma.
-- ==========================================================================
-- Roda como dono do banco no SQL Editor, então alcança todos os usuários.
update matches set status = 'expired'
 where status = 'in_progress' and now() > deadline;

update matches set status = 'grading_failed'
 where status = 'grading'
   and submitted_at is not null
   and now() > submitted_at + interval '15 minutes';

-- ==========================================================================
-- 4) RESULTADO — leia estas linhas.
-- ==========================================================================
select
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'iniciar_partida')
    as assinaturas_de_iniciar_partida,   -- tem de ser 1
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'iniciar_partida'
      and pg_get_functiondef(p.oid) ilike '%advisory_xact_lock%')
    as versao_nova,                      -- tem de ser 1
  (select count(*) from matches
    where status in ('in_progress','submitted','grading','needs_reupload'))
    as partidas_ocupando_o_indice;       -- 0 se nenhuma partida legítima em curso

-- Se assinaturas <> 1 ou versao_nova = 0, a correção NÃO entrou: mande o
-- resultado desta consulta.
