-- PEPVI — ranking e dificuldades desbloqueáveis.
--
-- Rode DEPOIS de schema.sql e ANTES de fix-game-loop.sql (que recria a
-- iniciar_partida já usando a tabela de dificuldades).
--
-- Idempotente.

-- ==========================================================================
-- 1) Nome de exibição neutro
--
-- O trigger gerava username a partir do e-mail ("fulano-a1b2"). Enquanto
-- ninguém via o perfil dos outros isso era inofensivo; com ranking, vira
-- vazamento da parte local do e-mail de todo mundo.
--
-- Novos usuários nascem com nome neutro. Quem já existe precisa trocar o seu
-- (a tela de progresso tem o campo) — a linha comentada no fim deste arquivo
-- renomeia todos de uma vez, se você preferir.
-- ==========================================================================
create or replace function criar_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username)
  values (new.id, 'jogador-' || substring(new.id::text from 1 for 6))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ==========================================================================
-- 2) Dificuldades
--
-- Tabela, não constante em TypeScript: o servidor precisa validar o
-- desbloqueio (cliente não pode simplesmente pedir "relâmpago") e a tela
-- precisa listar. Duas cópias da mesma regra é o bug que já nos custou três
-- rodadas.
--
-- xp_multiplier existe porque o bônus de velocidade é RELATIVO à duração:
-- terminar em 45 de 60 min rende ratio 0,25, contra 0,50 em 45 de 90. Sem o
-- multiplicador, a dificuldade maior pagaria MENOS — incentivo invertido.
-- ==========================================================================
create table if not exists difficulties (
  id               text primary key,
  label            text not null,
  descricao        text not null,
  duration_seconds integer not null,
  xp_multiplier    numeric(3,2) not null default 1.00,
  min_xp           integer not null default 0,
  order_index      smallint not null default 0
);

insert into difficulties (id, label, descricao, duration_seconds, xp_multiplier, min_xp, order_index)
values
  ('padrao',    'Padrão',    'Tempo cheio, como no treino comum.',              5400, 1.00,     0, 0),
  ('rapido',    'Rápido',    'Uma hora. Menos tempo para planejar.',            3600, 1.25,  2500, 1),
  ('relampago', 'Relâmpago', '40 minutos. Só dá tempo se a estrutura já for automática.', 2400, 1.60,  8500, 2)
on conflict (id) do update
  set label = excluded.label,
      descricao = excluded.descricao,
      duration_seconds = excluded.duration_seconds,
      xp_multiplier = excluded.xp_multiplier,
      min_xp = excluded.min_xp,
      order_index = excluded.order_index;

alter table difficulties enable row level security;
drop policy if exists difficulties_read on difficulties;
create policy difficulties_read on difficulties for select using (true);

-- Qual dificuldade a partida usou. Snapshot do id; a duração já é gravada em
-- duration_seconds, então rebalancear a tabela não reescreve o passado.
alter table matches
  add column if not exists difficulty text not null default 'padrao'
    references difficulties(id);

-- ==========================================================================
-- 3) XP total do usuário — uma definição só
--
-- Usada pelo desbloqueio de dificuldade e pelo ranking. Sem isto, a regra
-- "quanto XP eu tenho" existiria em três lugares.
-- ==========================================================================
create or replace function xp_total(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(xp_final), 0)::integer
    from matches
   where user_id = p_user_id and status = 'graded'
     -- Treino livre grava xp_final = 0, então somá-lo não mudaria a conta hoje.
     -- A exclusão é explícita mesmo assim: é a linha que impede um bug de
     -- pontuação futuro de virar XP de graça e desbloqueio de dificuldade.
     and not is_free;
$$;

-- ==========================================================================
-- 4) Dificuldades disponíveis para o usuário da sessão
-- ==========================================================================
create or replace function dificuldades_disponiveis()
returns table (
  id text, label text, descricao text,
  duration_seconds integer, xp_multiplier numeric,
  min_xp integer, desbloqueada boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.label, d.descricao, d.duration_seconds, d.xp_multiplier,
         d.min_xp, (xp_total(auth.uid()) >= d.min_xp) as desbloqueada
    from difficulties d
   order by d.order_index;
$$;

-- ==========================================================================
-- 5) Ranking
--
-- security definer porque agrega ENTRE usuários — a RLS de matches restringe a
-- auth.uid(), e afrouxá-la para o ranking exporia todas as redações. A função
-- devolve só o que um placar precisa: nome, XP e contagem.
--
-- Desempate por MENOS partidas: mesmo XP com menos redações é melhor
-- aproveitamento.
--
-- ponytail: limit 100 e sem "sua posição se estiver fora do top". Com menos de
-- 100 jogadores todo mundo aparece; acrescentar quando passar disso.
-- ==========================================================================
create or replace function ranking(p_periodo text default 'historico')
returns table (
  posicao bigint, username text, xp bigint, partidas bigint, eu boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select m.user_id,
           sum(m.xp_final)::bigint as xp,
           count(*)::bigint as partidas
      from matches m
     where m.status = 'graded'
       and m.xp_final is not null
       -- Fora do placar. Não só pelo XP (que é zero): `partidas` é o critério
       -- de desempate, e treino livre é ilimitado — quem treinasse muito
       -- subiria de posição sem escrever nada que valha.
       and not m.is_free
       and (
         p_periodo = 'historico'
         or (p_periodo = 'semana' and m.submitted_at >= date_trunc('week', now()))
         or (p_periodo = 'mes'    and m.submitted_at >= date_trunc('month', now()))
       )
     group by m.user_id
  )
  select row_number() over (order by b.xp desc, b.partidas asc) as posicao,
         p.username,
         b.xp,
         b.partidas,
         (b.user_id = auth.uid()) as eu
    from base b
    join profiles p on p.id = b.user_id
   order by posicao
   limit 100;
$$;

-- ==========================================================================
-- Renomear em lote quem já tem nome derivado do e-mail.
-- Descomente e rode se quiser resolver de uma vez, em vez de pedir a cada um.
--
-- update profiles
--    set username = 'jogador-' || substring(id::text from 1 for 6)
--  where username !~ '^jogador-';
-- ==========================================================================

select (select count(*) from difficulties) as dificuldades,
       (select count(*) from profiles where username ~ '^jogador-') as nomes_neutros,
       (select count(*) from profiles) as perfis;
