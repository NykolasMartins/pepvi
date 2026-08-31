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
-- A assinatura de 1 argumento sai junto: o treino livre acrescentou
-- p_theme_id e p_minutes, e "create or replace" trocaria só uma das duas.
-- Com as duas no banco, o PostgREST pode resolver para a antiga e o modo livre
-- "não existe" sem nenhum erro visível.
drop function if exists iniciar_partida(text, uuid, integer);
-- O tema escrito pelo jogador acrescentou p_tema_livre. Mesma armadilha de
-- sempre: sem este drop ficariam duas assinaturas no banco e o PostgREST
-- poderia resolver para a de três argumentos, ignorando o tema digitado sem
-- devolver erro nenhum.
drop function if exists iniciar_partida(text, uuid, integer, text);

-- ==========================================================================
-- 2) Cria a versão correta.
-- ==========================================================================
-- p_user_id foi REMOVIDO: id de usuário vindo do cliente é dado não confiável.
-- auth.uid() vem do JWT que o Postgres já validou.
-- A duração agora vem da dificuldade, não do cliente. Deixar o cliente
-- escolher os segundos seria deixá-lo escolher a própria dificuldade — e o
-- bônus de velocidade é calculado sobre ela.
-- p_minutes e p_theme_id são o modo TREINO LIVRE, e só existem porque ele não
-- paga XP. A regra "o cliente não escolhe os segundos" continua valendo para a
-- partida comum: lá a duração é a dificuldade, e a dificuldade é o que o bônus
-- de velocidade e o multiplicador leem. Sem XP em jogo não há o que inflar,
-- então escolher o próprio relógio deixa de ser vantagem e vira treino.
--
-- Uma função só, e não uma iniciar_treino_livre() ao lado: a regra de UMA
-- partida ativa por usuário (advisory lock + materialização de partida
-- fantasma + índice one_active_match) precisa existir num lugar só. Duas
-- funções seriam duas cópias dela, e a segunda cópia é sempre a que fica para
-- trás.
create function iniciar_partida(
  p_difficulty text    default 'padrao',
  p_theme_id   uuid    default null,
  p_minutes    integer default null,
  p_tema_livre text    default null
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
  v_is_free    boolean := p_minutes is not null;
  v_titulo     text;
begin
  if p_user_id is null then
    raise exception 'não autenticado';
  end if;

  if v_is_free then
    -- Piso e teto no BANCO. O seletor da tela também limita, mas ele é
    -- cosmético: p_minutes chega por POST e um valor negativo criaria partida
    -- com deadline no passado — nascida expirada.
    if p_minutes < 5 or p_minutes > 240 then
      raise exception 'o treino livre aceita de 5 a 240 minutos';
    end if;
    v_dur := p_minutes * 60;
  else
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
  --
  -- Partida PAUSADA não expira pelo deadline: o prazo dela está congelado. Mas
  -- também não pode ficar viva para sempre em cima de one_active_match, senão
  -- um treino pausado e esquecido impede toda partida nova. Depois de 24 h
  -- parada ela volta a ser expirável. Mesmo teto de retomar_partida() e de
  -- PAUSE_TIMEOUT_MS em lib/matchStatus.ts — os três precisam concordar.
  update matches
     set status = 'expired'
   where user_id = p_user_id
     and status = 'in_progress'
     and (
       (paused_at is null and now() > deadline)
       or (paused_at is not null and now() > paused_at + interval '24 hours')
     );

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

  -- ---- Escolhe o tema e cria ---------------------------------------------
  if v_is_free then
    v_titulo := nullif(btrim(coalesce(p_tema_livre, '')), '');

    if v_titulo is not null then
      -- Tema escrito pelo jogador. Os limites são aqui porque o texto vira
      -- prompt de IA: um título de 40 mil caracteres é conta paga sem redação
      -- escrita, e um de duas letras não é tema.
      if length(v_titulo) < 10 or length(v_titulo) > 180 then
        raise exception 'o tema precisa ter de 10 a 180 caracteres';
      end if;

      -- O ENUNCIADO é montado aqui, não recebido. O jogador escolhe o tema; se
      -- ele mandasse também a proposta, escolheria o texto que vai junto do
      -- prompt de correção — e a instrução "respeite os direitos humanos", que
      -- a Competência 5 cobra, deixaria de ser garantida.
      --
      -- Sem "a partir da leitura dos textos motivadores": tema escrito à mão
      -- não tem motivadores, e prometer textos que não existem confunde quem
      -- está treinando.
      insert into themes (title, statement, active, created_by)
      values (
        v_titulo,
        'Com base nos conhecimentos construídos ao longo de sua formação, '
          || 'redija um texto dissertativo-argumentativo em modalidade escrita '
          || 'formal da língua portuguesa sobre o tema "' || v_titulo || '", '
          || 'apresentando proposta de intervenção que respeite os direitos humanos.',
        false,          -- fora da roleta: sortear_tema filtra por active
        p_user_id
      )
      on conflict (created_by, lower(title)) where created_by is not null
        do nothing;

      -- do nothing não devolve linha quando o tema já existia, então o id vem
      -- do select — que é também o caminho de "treinar o mesmo tema de novo".
      select t.id into v_theme_id from themes t
       where t.created_by = p_user_id and lower(t.title) = lower(v_titulo);

    elsif p_theme_id is not null then
      -- Só tema ativo, e a checagem é aqui: o id vem do cliente, e uma partida
      -- apontando para tema inativo mostraria uma proposta que foi tirada do ar
      -- de propósito.
      select t.id into v_theme_id from themes t
       where t.id = p_theme_id and t.active;
      if v_theme_id is null then
        raise exception 'tema indisponível';
      end if;
    else
      -- Aleatório do treino livre inclui o que já foi jogado. Não é sortear_tema:
      -- ali "inédito" existe para proteger o valor da partida que pontua, e aqui
      -- repetir um tema para treinar de novo é justamente o caso de uso.
      select t.id into v_theme_id from themes t
       where t.active order by random() limit 1;
      if v_theme_id is null then
        raise exception 'nenhum tema ativo cadastrado';
      end if;
    end if;
    -- is_replay fica false: ele é o desconto de 0,5x sobre um XP que aqui não
    -- existe, e marcá-lo só acenderia um aviso de penalidade sem penalidade.
    v_is_replay := false;
  else
    select theme_id, is_replay into v_theme_id, v_is_replay
    from sortear_tema(p_user_id);

    if v_theme_id is null then
      raise exception 'nenhum tema ativo cadastrado';
    end if;
  end if;

  insert into matches (
    user_id, theme_id, duration_seconds, is_replay, started_at, deadline,
    difficulty, is_free
  )
  values (
    p_user_id, v_theme_id, v_dur, v_is_replay,
    v_started_at,
    v_started_at + make_interval(secs => v_dur),
    p_difficulty, v_is_free
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
 where status = 'in_progress'
   and (
     (paused_at is null and now() > deadline)
     or (paused_at is not null and now() > paused_at + interval '24 hours')
   );

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
      and pg_get_functiondef(p.oid) ilike '%advisory_xact_lock%'
      and pg_get_functiondef(p.oid) ilike '%is_free%')
    as versao_nova,                      -- tem de ser 1
  (select count(*) from matches
    where status in ('in_progress','submitted','grading','needs_reupload'))
    as partidas_ocupando_o_indice;       -- 0 se nenhuma partida legítima em curso

-- Se assinaturas <> 1 ou versao_nova = 0, a correção NÃO entrou: mande o
-- resultado desta consulta.
