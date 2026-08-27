-- PEPVI — amigos e duelos assíncronos.
--
-- Rode DEPOIS de ranking-e-dificuldades.sql. Idempotente.
--
-- Duelo assíncrono: os dois jogam o MESMO tema, com a MESMA dificuldade, cada
-- um na sua hora. Fecha quando o segundo entrega. Não é ao vivo de propósito —
-- a partida dura 90 minutos, e marcar 90 minutos simultâneos com um amigo é
-- combinação que quase nunca acontece.

-- ==========================================================================
-- 1) Código de amigo
--
-- profiles tem RLS "só a própria linha": um usuário não consegue procurar
-- outro por nome, e é assim que deve ser. O código curto é o que a pessoa
-- compartilha por fora — e as funções abaixo são o único caminho para
-- resolver código em perfil.
--
-- Alfabeto sem 0/O e 1/I: o código vai ser ditado por voz e digitado errado.
-- ==========================================================================
alter table profiles add column if not exists friend_code text;

create or replace function gerar_friend_code()
returns text
language plpgsql
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tentativa text;
  i integer;
begin
  loop
    tentativa := '';
    for i in 1..6 loop
      tentativa := tentativa || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from profiles where friend_code = tentativa);
  end loop;
  return tentativa;
end;
$$;

update profiles set friend_code = gerar_friend_code() where friend_code is null;

alter table profiles alter column friend_code set not null;
create unique index if not exists profiles_friend_code on profiles (friend_code);

create or replace function criar_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username, friend_code)
  values (
    new.id,
    'jogador-' || substring(new.id::text from 1 for 6),
    gerar_friend_code()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ==========================================================================
-- 2) Amizades
--
-- Uma linha por relação, com quem pediu registrado. O índice único sobre o par
-- ORDENADO impede que A→B e B→A coexistam — sem ele, dois pedidos cruzados
-- criariam duas amizades entre as mesmas pessoas.
-- ==========================================================================
create table if not exists friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status       text not null default 'pendente' check (status in ('pendente','aceito')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_par
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee on friendships (addressee_id, status);

alter table friendships enable row level security;
drop policy if exists friendships_minhas on friendships;
create policy friendships_minhas on friendships
  for select using (auth.uid() in (requester_id, addressee_id));

-- ==========================================================================
-- 3) Duelos
-- ==========================================================================
create table if not exists duels (
  id             uuid primary key default gen_random_uuid(),
  challenger_id  uuid not null references profiles(id) on delete cascade,
  opponent_id    uuid not null references profiles(id) on delete cascade,
  theme_id       uuid not null references themes(id),
  difficulty     text not null references difficulties(id) default 'padrao',
  status         text not null default 'pendente'
                   check (status in ('pendente','ativo','concluido','recusado')),
  created_at     timestamptz not null default now(),
  -- Duelo que ninguém joga não pode ficar aberto para sempre segurando o tema.
  expires_at     timestamptz not null default now() + interval '7 days',
  check (challenger_id <> opponent_id)
);

create index if not exists duels_meus on duels (challenger_id, created_at desc);
create index if not exists duels_contra on duels (opponent_id, created_at desc);

-- Liga a partida ao duelo. Null = partida normal.
alter table matches add column if not exists duel_id uuid references duels(id) on delete set null;
create unique index if not exists matches_duel_user on matches (duel_id, user_id)
  where duel_id is not null;

alter table duels enable row level security;
drop policy if exists duels_meus on duels;
create policy duels_meus on duels
  for select using (auth.uid() in (challenger_id, opponent_id));

-- ==========================================================================
-- 4) Amizade — operações
-- ==========================================================================
create or replace function amigo_por_codigo(p_codigo text)
returns table (id uuid, username text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.username
    from profiles p
   where upper(trim(p.friend_code)) = upper(trim(p_codigo))
     and p.id <> auth.uid();
$$;

create or replace function pedir_amizade(p_codigo text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_eu    uuid := auth.uid();
  v_outro uuid;
begin
  if v_eu is null then raise exception 'não autenticado'; end if;

  select id into v_outro from amigo_por_codigo(p_codigo);
  if v_outro is null then
    raise exception 'código não encontrado';
  end if;

  -- Já existe relação nos dois sentidos? Então isto é uma resposta, não um
  -- pedido novo: quem pede para quem já pediu está aceitando.
  update friendships
     set status = 'aceito', responded_at = now()
   where requester_id = v_outro and addressee_id = v_eu and status = 'pendente';

  if found then return 'aceito'; end if;

  insert into friendships (requester_id, addressee_id)
  values (v_eu, v_outro)
  on conflict do nothing;

  if not found then return 'ja_existe'; end if;
  return 'pendente';
end;
$$;

create or replace function responder_amizade(p_id uuid, p_aceitar boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_aceitar then
    update friendships set status = 'aceito', responded_at = now()
     where id = p_id and addressee_id = auth.uid() and status = 'pendente';
  else
    -- Recusar apaga em vez de marcar: assim a pessoa pode tentar de novo
    -- depois, e não guardamos um "não" para sempre.
    delete from friendships
     where id = p_id and addressee_id = auth.uid() and status = 'pendente';
  end if;
end;
$$;

create or replace function meus_amigos()
returns table (
  friendship_id uuid, amigo_id uuid, username text, status text,
  sou_solicitante boolean, xp integer
)
language sql stable security definer set search_path = public
as $$
  select f.id,
         case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
         p.username,
         f.status,
         (f.requester_id = auth.uid()),
         xp_total(case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end)
    from friendships f
    join profiles p
      on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
   where auth.uid() in (f.requester_id, f.addressee_id)
   order by f.status, p.username;
$$;

-- ==========================================================================
-- 5) Duelo — criação
--
-- O tema precisa ser inédito para OS DOIS. Sortear um que o adversário já
-- jogou daria a ele vantagem de repertório e queimaria a comparação.
-- ==========================================================================
create or replace function sortear_tema_duelo(p_a uuid, p_b uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select t.id
    from themes t
   where t.active
     and not exists (
       select 1 from matches m
        where m.theme_id = t.id
          and m.user_id in (p_a, p_b)
          and m.status <> 'cancelled'
     )
   order by random()
   limit 1;
$$;

create or replace function criar_duelo(p_amigo_id uuid, p_difficulty text default 'padrao')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_eu      uuid := auth.uid();
  v_tema    uuid;
  v_min_xp  integer;
  v_duel    uuid;
begin
  if v_eu is null then raise exception 'não autenticado'; end if;

  if not exists (
    select 1 from friendships
     where status = 'aceito'
       and ((requester_id = v_eu and addressee_id = p_amigo_id)
         or (requester_id = p_amigo_id and addressee_id = v_eu))
  ) then
    raise exception 'vocês não são amigos';
  end if;

  -- A dificuldade precisa estar desbloqueada para OS DOIS: desafiar alguém
  -- para um modo que ele não pode jogar é convite impossível de aceitar.
  select min_xp into v_min_xp from difficulties where id = p_difficulty;
  if v_min_xp is null then raise exception 'dificuldade inválida'; end if;
  if xp_total(v_eu) < v_min_xp then raise exception 'você ainda não desbloqueou essa dificuldade'; end if;
  if xp_total(p_amigo_id) < v_min_xp then raise exception 'seu amigo ainda não desbloqueou essa dificuldade'; end if;

  if exists (
    select 1 from duels
     where status in ('pendente','ativo')
       and now() <= expires_at
       and ((challenger_id = v_eu and opponent_id = p_amigo_id)
         or (challenger_id = p_amigo_id and opponent_id = v_eu))
  ) then
    raise exception 'já existe um duelo em aberto com essa pessoa';
  end if;

  v_tema := sortear_tema_duelo(v_eu, p_amigo_id);
  if v_tema is null then
    raise exception 'não há tema inédito para vocês dois';
  end if;

  insert into duels (challenger_id, opponent_id, theme_id, difficulty)
  values (v_eu, p_amigo_id, v_tema, p_difficulty)
  returning id into v_duel;

  return v_duel;
end;
$$;

create or replace function responder_duelo(p_duel_id uuid, p_aceitar boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update duels
     set status = case when p_aceitar then 'ativo' else 'recusado' end
   where id = p_duel_id
     and opponent_id = auth.uid()
     and status = 'pendente'
     and now() <= expires_at;

  if not found then
    raise exception 'convite indisponível';
  end if;
end;
$$;

-- ==========================================================================
-- 6) Jogar a partida do duelo
--
-- Mesma materialização de partidas fantasma da iniciar_partida: sem ela, o
-- índice one_active_match bloqueia com uma partida vencida que só existe na
-- coluna. Ver PRD 4.5.
-- ==========================================================================
create or replace function iniciar_partida_duelo(p_duel_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_eu       uuid := auth.uid();
  d          record;
  v_dur      integer;
  v_match_id uuid;
  v_agora    timestamptz := now();
begin
  if v_eu is null then raise exception 'não autenticado'; end if;

  perform pg_advisory_xact_lock(hashtext(v_eu::text));

  select * into d from duels
   where id = p_duel_id and v_eu in (challenger_id, opponent_id);

  if d is null then raise exception 'duelo não encontrado'; end if;
  if d.status <> 'ativo' then raise exception 'o duelo não está ativo'; end if;
  if now() > d.expires_at then raise exception 'o duelo expirou'; end if;

  -- Já jogou a sua parte? Devolve a partida existente em vez de criar outra.
  select id into v_match_id from matches
   where duel_id = p_duel_id and user_id = v_eu;
  if v_match_id is not null then return v_match_id; end if;

  update matches set status = 'expired'
   where user_id = v_eu and status = 'in_progress' and now() > deadline;

  update matches set status = 'grading_failed'
   where user_id = v_eu and status = 'grading'
     and submitted_at is not null
     and now() > submitted_at + interval '15 minutes';

  if exists (
    select 1 from matches
     where user_id = v_eu
       and status in ('in_progress','submitted','grading','needs_reupload')
  ) then
    raise exception 'termine sua partida em andamento antes de jogar o duelo';
  end if;

  select duration_seconds into v_dur from difficulties where id = d.difficulty;

  insert into matches (
    user_id, theme_id, duration_seconds, started_at, deadline, difficulty, duel_id
  )
  values (
    v_eu, d.theme_id, v_dur, v_agora,
    v_agora + make_interval(secs => v_dur), d.difficulty, p_duel_id
  )
  returning id into v_match_id;

  return v_match_id;
end;
$$;

-- ==========================================================================
-- 7) Listagem dos duelos
--
-- O resultado é DERIVADO na leitura, não gravado: enquanto os dois não
-- entregarem, não há vencedor, e depois que entregarem o vencedor é uma
-- comparação de dois números que já estão na tabela. Coluna winner_id seria
-- uma segunda verdade para dessincronizar.
-- ==========================================================================
create or replace function meus_duelos()
returns table (
  duel_id uuid, status text, expirado boolean, sou_desafiante boolean,
  oponente_id uuid, oponente_nome text,
  tema_titulo text, dificuldade text, criado_em timestamptz, expira_em timestamptz,
  minha_match_id uuid, minha_status match_status, meu_xp integer,
  oponente_match_id uuid, oponente_status match_status, oponente_xp integer,
  resultado text
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select d.*,
           (d.challenger_id = auth.uid()) as sou_desafiante,
           case when d.challenger_id = auth.uid() then d.opponent_id else d.challenger_id end as outro_id
      from duels d
     where auth.uid() in (d.challenger_id, d.opponent_id)
  )
  select b.id,
         b.status,
         (now() > b.expires_at and b.status in ('pendente','ativo')) as expirado,
         b.sou_desafiante,
         b.outro_id,
         p.username,
         t.title,
         b.difficulty,
         b.created_at,
         b.expires_at,
         meu.id, meu.status, meu.xp_final,
         seu.id, seu.status, seu.xp_final,
         case
           when meu.xp_final is null or seu.xp_final is null then 'aguardando'
           when meu.xp_final > seu.xp_final then 'ganhei'
           when meu.xp_final < seu.xp_final then 'perdi'
           else 'empate'
         end
    from base b
    join profiles p on p.id = b.outro_id
    join themes   t on t.id = b.theme_id
    left join matches meu on meu.duel_id = b.id and meu.user_id = auth.uid()
    left join matches seu on seu.duel_id = b.id and seu.user_id = b.outro_id
   order by b.created_at desc;
$$;

select (select count(*) from profiles where friend_code is not null) as com_codigo,
       (select count(*) from friendships) as amizades,
       (select count(*) from duels) as duelos;
