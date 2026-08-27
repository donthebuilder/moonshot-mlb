create table if not exists public.nfl_players (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_player_id text not null,
  season smallint not null,
  name text not null,
  position text not null check (position in ('QB','RB','WR','TE','K','DEF')),
  team text,
  active boolean not null default true,
  injury_status text,
  source_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (source, source_player_id, season)
);

create table if not exists public.fantasy_roster_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id),
  acquired_via text not null default 'draft' check (acquired_via in ('draft','waiver','free_agent','trade','commissioner')),
  acquired_at timestamptz not null default now(),
  released_at timestamptz,
  unique nulls not distinct (league_id, player_id, released_at)
);

create table if not exists public.fantasy_lineup_slots (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id),
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  slot text not null check (slot in ('QB','RB','WR','TE','FLEX','K','DEF','BENCH','IR')),
  slot_index smallint not null default 1 check (slot_index between 1 and 20),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, season, week, player_id),
  unique (team_id, season, week, slot, slot_index)
);

create table if not exists public.fantasy_drafts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references public.fantasy_leagues(id) on delete cascade,
  status text not null default 'setup' check (status in ('setup','live','paused','complete')),
  order_team_ids uuid[] not null default '{}',
  rounds smallint not null default 15 check (rounds between 1 and 30),
  timer_seconds smallint not null check (timer_seconds in (30,60,90,120)),
  current_overall_pick smallint not null default 1,
  pick_deadline timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fantasy_draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.fantasy_drafts(id) on delete cascade,
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid references public.nfl_players(id),
  round smallint not null,
  pick_in_round smallint not null,
  overall_pick smallint not null,
  assignment_type text not null default 'live' check (assignment_type in ('live','auto','manual')),
  picked_at timestamptz,
  unique (draft_id, overall_pick),
  unique (draft_id, player_id)
);

create index if not exists nfl_players_lookup_idx on public.nfl_players(season, position, team);
create index if not exists fantasy_roster_team_idx on public.fantasy_roster_entries(team_id) where released_at is null;
create index if not exists fantasy_lineup_week_idx on public.fantasy_lineup_slots(league_id, season, week);
create index if not exists fantasy_draft_picks_idx on public.fantasy_draft_picks(draft_id, overall_pick);

alter table public.nfl_players enable row level security;
alter table public.fantasy_roster_entries enable row level security;
alter table public.fantasy_lineup_slots enable row level security;
alter table public.fantasy_drafts enable row level security;
alter table public.fantasy_draft_picks enable row level security;

create policy "authenticated users read NFL catalog" on public.nfl_players
for select to authenticated using (true);
create policy "members read rosters" on public.fantasy_roster_entries
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read lineups" on public.fantasy_lineup_slots
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "owners manage unlocked lineups" on public.fantasy_lineup_slots
for all to authenticated
using (
  locked_at is null and exists (
    select 1 from public.fantasy_teams t where t.id = team_id and t.owner_id = auth.uid()
  )
)
with check (
  locked_at is null and exists (
    select 1 from public.fantasy_teams t where t.id = team_id and t.owner_id = auth.uid()
  )
);
create policy "members read drafts" on public.fantasy_drafts
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "commissioners manage drafts" on public.fantasy_drafts
for all to authenticated using (public.is_fantasy_commissioner(league_id))
with check (public.is_fantasy_commissioner(league_id));
create policy "members read draft picks" on public.fantasy_draft_picks
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "commissioners assign draft picks" on public.fantasy_draft_picks
for all to authenticated using (public.is_fantasy_commissioner(league_id))
with check (public.is_fantasy_commissioner(league_id));

create or replace function public.prepare_fantasy_draft(
  p_league_id uuid,
  p_order_team_ids uuid[],
  p_rounds smallint default 15
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_league public.fantasy_leagues%rowtype;
  v_draft uuid;
  v_team_count int;
  v_round int;
  v_pick int;
  v_index int;
  v_overall int := 1;
begin
  select * into v_league from public.fantasy_leagues where id = p_league_id for update;
  if not found or v_league.commissioner_id <> auth.uid() then raise exception 'Commissioner access required'; end if;
  if v_league.status <> 'setup' then raise exception 'The league draft can no longer be prepared'; end if;

  select count(*) into v_team_count from public.fantasy_teams where league_id = p_league_id;
  if coalesce(array_length(p_order_team_ids, 1), 0) <> v_team_count then raise exception 'Draft order must include every team'; end if;
  if (select count(distinct x) from unnest(p_order_team_ids) x) <> v_team_count then raise exception 'Draft order contains duplicate teams'; end if;
  if exists (select 1 from unnest(p_order_team_ids) x where not exists (
    select 1 from public.fantasy_teams t where t.id = x and t.league_id = p_league_id
  )) then raise exception 'Draft order contains a team from another league'; end if;

  insert into public.fantasy_drafts (league_id, order_team_ids, rounds, timer_seconds)
  values (p_league_id, p_order_team_ids, p_rounds, v_league.draft_timer_seconds)
  on conflict (league_id) do update set order_team_ids = excluded.order_team_ids,
    rounds = excluded.rounds, timer_seconds = excluded.timer_seconds
  returning id into v_draft;

  delete from public.fantasy_draft_picks where draft_id = v_draft and player_id is null;
  for v_round in 1..p_rounds loop
    for v_pick in 1..v_team_count loop
      v_index := case when mod(v_round, 2) = 1 then v_pick else v_team_count - v_pick + 1 end;
      insert into public.fantasy_draft_picks (
        draft_id, league_id, team_id, round, pick_in_round, overall_pick
      ) values (
        v_draft, p_league_id, p_order_team_ids[v_index], v_round, v_pick, v_overall
      ) on conflict (draft_id, overall_pick) do update set team_id = excluded.team_id,
        round = excluded.round, pick_in_round = excluded.pick_in_round;
      v_overall := v_overall + 1;
    end loop;
  end loop;
  return v_draft;
end;
$$;

revoke all on function public.prepare_fantasy_draft(uuid,uuid[],smallint) from public;
grant execute on function public.prepare_fantasy_draft(uuid,uuid[],smallint) to authenticated;
