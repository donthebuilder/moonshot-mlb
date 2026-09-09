create table if not exists public.fantasy_matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  home_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  away_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  home_score numeric(8,2) not null default 0,
  away_score numeric(8,2) not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled','live','final')),
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  unique (league_id, season, week, home_team_id),
  unique (league_id, season, week, away_team_id)
);

create index if not exists fantasy_matchups_week_idx
  on public.fantasy_matchups(league_id, season, week);

alter table public.fantasy_matchups enable row level security;

create policy "members read matchups" on public.fantasy_matchups
for select to authenticated using (public.is_fantasy_league_member(league_id));

create or replace function public.generate_fantasy_schedule(
  p_league_id uuid,
  p_season smallint default 2026,
  p_weeks smallint default 14
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_team_ids uuid[];
  v_rotated uuid[];
  v_next uuid[];
  v_team_count integer;
  v_slots integer;
  v_round integer;
  v_week integer;
  v_pair integer;
  v_home uuid;
  v_away uuid;
  v_created integer := 0;
begin
  if not public.is_fantasy_commissioner(p_league_id)
    then raise exception 'Commissioner access required'; end if;
  if p_season not between 2025 and 2100 or p_weeks not between 1 and 18
    then raise exception 'Invalid schedule season or length'; end if;
  if exists (select 1 from public.fantasy_matchups where league_id=p_league_id and season=p_season)
    then raise exception 'This season already has a schedule'; end if;

  select array_agg(id order by coalesce(draft_position, 32767), created_at, id)
    into v_team_ids from public.fantasy_teams where league_id=p_league_id;
  v_team_count := coalesce(array_length(v_team_ids,1),0);
  if v_team_count < 2 then raise exception 'At least two teams are required'; end if;

  v_rotated := v_team_ids;
  if mod(v_team_count,2)=1 then v_rotated := array_append(v_rotated,null::uuid); end if;
  v_slots := array_length(v_rotated,1);

  for v_week in 1..p_weeks loop
    v_round := mod(v_week-1,v_slots-1);
    if v_round=0 and v_week>1 then v_rotated := v_team_ids;
      if mod(v_team_count,2)=1 then v_rotated := array_append(v_rotated,null::uuid); end if;
    end if;
    for v_pair in 1..(v_slots/2) loop
      v_home := v_rotated[v_pair];
      v_away := v_rotated[v_slots-v_pair+1];
      if v_home is not null and v_away is not null then
        if mod(v_week+v_pair,2)=0 then
          insert into public.fantasy_matchups(league_id,season,week,home_team_id,away_team_id)
            values(p_league_id,p_season,v_week,v_home,v_away);
        else
          insert into public.fantasy_matchups(league_id,season,week,home_team_id,away_team_id)
            values(p_league_id,p_season,v_week,v_away,v_home);
        end if;
        v_created := v_created+1;
      end if;
    end loop;
    v_next := array[v_rotated[1],v_rotated[v_slots]]::uuid[];
    if v_slots>2 then v_next := v_next || v_rotated[2:v_slots-1]; end if;
    v_rotated := v_next;
  end loop;
  return v_created;
end;
$$;

create or replace function public.set_fantasy_matchup_score(
  p_matchup_id uuid,
  p_home_score numeric,
  p_away_score numeric,
  p_status text default 'final'
) returns void language plpgsql security definer set search_path = public as $$
declare v_league_id uuid;
begin
  select league_id into v_league_id from public.fantasy_matchups where id=p_matchup_id;
  if v_league_id is null or not public.is_fantasy_commissioner(v_league_id)
    then raise exception 'Commissioner access required'; end if;
  if p_status not in ('scheduled','live','final') then raise exception 'Invalid matchup status'; end if;
  if p_home_score<0 or p_away_score<0 then raise exception 'Scores cannot be negative'; end if;
  update public.fantasy_matchups set home_score=round(p_home_score,2), away_score=round(p_away_score,2), status=p_status
    where id=p_matchup_id;
end;
$$;

revoke all on function public.generate_fantasy_schedule(uuid,smallint,smallint) from public;
revoke all on function public.set_fantasy_matchup_score(uuid,numeric,numeric,text) from public;
grant execute on function public.generate_fantasy_schedule(uuid,smallint,smallint) to authenticated;
grant execute on function public.set_fantasy_matchup_score(uuid,numeric,numeric,text) to authenticated;
