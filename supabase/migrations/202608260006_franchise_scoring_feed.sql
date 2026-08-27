create table if not exists public.nfl_week_games (
  game_id text primary key,
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  season_type smallint not null default 2,
  kickoff timestamptz not null,
  home_team text not null,
  away_team text not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','final')),
  source text not null default 'dash',
  updated_at timestamptz not null default now()
);

create table if not exists public.nfl_player_week_stats (
  player_id uuid not null references public.nfl_players(id) on delete cascade,
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  game_id text references public.nfl_week_games(game_id) on delete set null,
  stats jsonb not null default '{}'::jsonb,
  projected_points numeric(7,2),
  dash_score numeric(5,2),
  status text not null default 'scheduled' check (status in ('scheduled','live','final')),
  updated_at timestamptz not null default now(),
  primary key (player_id,season,week)
);

create index if not exists nfl_week_games_lookup_idx on public.nfl_week_games(season,week,kickoff);
create index if not exists nfl_player_week_stats_lookup_idx on public.nfl_player_week_stats(season,week,status);

alter table public.nfl_week_games enable row level security;
alter table public.nfl_player_week_stats enable row level security;
create policy "authenticated users read NFL games" on public.nfl_week_games for select to authenticated using (true);
create policy "authenticated users read NFL weekly stats" on public.nfl_player_week_stats for select to authenticated using (true);

create or replace function public.fantasy_points_for_stats(p_stats jsonb,p_scoring text)
returns numeric language sql immutable set search_path=public as $$
  select round((
    coalesce((p_stats->>'passing_yards')::numeric,0)*0.04+
    coalesce((p_stats->>'passing_touchdowns')::numeric,0)*4-
    coalesce((p_stats->>'interceptions')::numeric,0)*2+
    coalesce((p_stats->>'rushing_yards')::numeric,0)*0.1+
    coalesce((p_stats->>'rushing_touchdowns')::numeric,0)*6+
    coalesce((p_stats->>'receiving_yards')::numeric,0)*0.1+
    coalesce((p_stats->>'receiving_touchdowns')::numeric,0)*6+
    coalesce((p_stats->>'receptions')::numeric,0)*(case p_scoring when 'ppr' then 1 when 'half_ppr' then 0.5 else 0 end)-
    coalesce((p_stats->>'fumbles_lost')::numeric,0)*2+
    coalesce((p_stats->>'two_point_conversions')::numeric,0)*2+
    coalesce((p_stats->>'field_goals_0_39')::numeric,0)*3+
    coalesce((p_stats->>'field_goals_40_49')::numeric,0)*4+
    coalesce((p_stats->>'field_goals_50_plus')::numeric,0)*5+
    coalesce((p_stats->>'extra_points')::numeric,0)+
    coalesce((p_stats->>'def_sacks')::numeric,0)+
    coalesce((p_stats->>'def_interceptions')::numeric,0)*2+
    coalesce((p_stats->>'def_fumble_recoveries')::numeric,0)*2+
    coalesce((p_stats->>'def_touchdowns')::numeric,0)*6+
    case when p_stats ? 'points_allowed' then case
      when (p_stats->>'points_allowed')::numeric=0 then 10
      when (p_stats->>'points_allowed')::numeric<=6 then 7
      when (p_stats->>'points_allowed')::numeric<=13 then 4
      when (p_stats->>'points_allowed')::numeric<=20 then 1
      when (p_stats->>'points_allowed')::numeric<=27 then 0
      when (p_stats->>'points_allowed')::numeric<=34 then -1 else -4 end else 0 end
  ),2);
$$;

create or replace function public.sync_nfl_week_feed(p_games jsonb,p_players jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game jsonb; v_player jsonb; v_player_id uuid; v_games integer:=0; v_players integer:=0;
begin
  if auth.uid() is null or not exists(select 1 from public.fantasy_league_memberships where user_id=auth.uid() and role='commissioner')
    then raise exception 'Commissioner access required'; end if;
  if jsonb_typeof(p_games)<>'array' or jsonb_typeof(p_players)<>'array' or jsonb_array_length(p_games)>400 or jsonb_array_length(p_players)>3000
    then raise exception 'Invalid NFL feed payload'; end if;
  for v_game in select value from jsonb_array_elements(p_games) loop
    if coalesce(v_game->>'gameId','')<>'' and coalesce(v_game->>'kickoff','')<>'' then
      insert into public.nfl_week_games(game_id,season,week,season_type,kickoff,home_team,away_team,status,source)
      values(v_game->>'gameId',(v_game->>'season')::smallint,(v_game->>'week')::smallint,coalesce((v_game->>'seasonType')::smallint,2),
        (v_game->>'kickoff')::timestamptz,v_game->>'homeTeam',v_game->>'awayTeam',coalesce(v_game->>'status','scheduled'),coalesce(v_game->>'source','dash'))
      on conflict(game_id) do update set kickoff=excluded.kickoff,status=excluded.status,updated_at=now();
      v_games:=v_games+1;
    end if;
  end loop;
  for v_player in select value from jsonb_array_elements(p_players) loop
    select id into v_player_id from public.nfl_players where source_player_id=v_player->>'sourcePlayerId' and season=(v_player->>'season')::smallint limit 1;
    if v_player_id is not null then
      insert into public.nfl_player_week_stats(player_id,season,week,game_id,stats,projected_points,dash_score,status)
      values(v_player_id,(v_player->>'season')::smallint,(v_player->>'week')::smallint,nullif(v_player->>'gameId',''),
        coalesce(v_player->'stats','{}'::jsonb),nullif(v_player->>'projectedPoints','')::numeric,nullif(v_player->>'dashScore','')::numeric,coalesce(v_player->>'status','scheduled'))
      on conflict(player_id,season,week) do update set game_id=excluded.game_id,stats=excluded.stats,
        projected_points=excluded.projected_points,dash_score=excluded.dash_score,status=excluded.status,updated_at=now();
      v_players:=v_players+1;
    end if;
  end loop;
  update public.fantasy_lineup_slots l set locked_at=g.kickoff
    from public.nfl_players p join public.nfl_week_games g on (g.home_team=p.team or g.away_team=p.team)
    where l.player_id=p.id and l.season=g.season and l.week=g.week and g.kickoff<=now() and l.locked_at is null;
  return jsonb_build_object('games',v_games,'players',v_players);
end;
$$;

create or replace function public.refresh_fantasy_matchup_scores(p_league_id uuid,p_season smallint,p_week smallint)
returns integer language plpgsql security definer set search_path=public as $$
declare v_scoring text; v_count integer;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select scoring into v_scoring from public.fantasy_leagues where id=p_league_id;
  update public.fantasy_matchups m set
    home_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week where l.team_id=m.home_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR')),0),
    away_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week where l.team_id=m.away_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR')),0),
    status=case when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.status='live') then 'live'
      when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week) and not exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.status<>'final') then 'final' else 'scheduled' end
    where m.league_id=p_league_id and m.season=p_season and m.week=p_week;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.sync_nfl_week_feed(jsonb,jsonb) from public;
revoke all on function public.refresh_fantasy_matchup_scores(uuid,smallint,smallint) from public;
grant execute on function public.sync_nfl_week_feed(jsonb,jsonb) to authenticated;
grant execute on function public.refresh_fantasy_matchup_scores(uuid,smallint,smallint) to authenticated;
