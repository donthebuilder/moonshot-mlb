create table if not exists public.fantasy_scoring_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'dash',
  status text not null default 'running' check (status in ('running','complete','failed')),
  season smallint,
  weeks smallint[] not null default '{}',
  games_synced integer not null default 0,
  players_synced integer not null default 0,
  matchups_refreshed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists fantasy_scoring_sync_runs_started_idx on public.fantasy_scoring_sync_runs(started_at desc);
alter table public.fantasy_scoring_sync_runs enable row level security;
create policy "authenticated users read scoring health" on public.fantasy_scoring_sync_runs for select to authenticated using (true);

create or replace function public.sync_nfl_player_catalog(p_catalog jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_count integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' and (auth.uid() is null or not exists(
    select 1 from public.fantasy_league_memberships where user_id=auth.uid() and role='commissioner'
  )) then raise exception 'Commissioner or scoring service access required'; end if;
  if jsonb_typeof(p_catalog)<>'array' or jsonb_array_length(p_catalog)>2000 then raise exception 'Invalid player catalog'; end if;
  for v_item in select value from jsonb_array_elements(p_catalog) loop
    if coalesce(v_item->>'position','') in ('QB','RB','WR','TE','K','DEF') and coalesce(v_item->>'sourcePlayerId','')<>'' and coalesce(v_item->>'name','')<>'' then
      insert into public.nfl_players(source,source_player_id,season,name,position,team,active,injury_status,source_payload,updated_at)
      values(coalesce(v_item->>'source','dash'),v_item->>'sourcePlayerId',(v_item->>'season')::smallint,left(v_item->>'name',100),v_item->>'position',nullif(v_item->>'team',''),coalesce((v_item->>'active')::boolean,true),nullif(v_item->>'injuryStatus',''),coalesce(v_item->'analytics','{}'::jsonb),now())
      on conflict(source,source_player_id,season) do update set name=excluded.name,position=excluded.position,team=excluded.team,active=excluded.active,injury_status=excluded.injury_status,source_payload=excluded.source_payload,updated_at=now();
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.sync_nfl_week_feed(p_games jsonb,p_players jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game jsonb; v_player jsonb; v_player_id uuid; v_games integer:=0; v_players integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' and (auth.uid() is null or not exists(
    select 1 from public.fantasy_league_memberships where user_id=auth.uid() and role='commissioner'
  )) then raise exception 'Commissioner or scoring service access required'; end if;
  if jsonb_typeof(p_games)<>'array' or jsonb_typeof(p_players)<>'array' or jsonb_array_length(p_games)>400 or jsonb_array_length(p_players)>3000 then raise exception 'Invalid NFL feed payload'; end if;
  for v_game in select value from jsonb_array_elements(p_games) loop
    if coalesce(v_game->>'gameId','')<>'' and coalesce(v_game->>'kickoff','')<>'' then
      insert into public.nfl_week_games(game_id,season,week,season_type,kickoff,home_team,away_team,status,source)
      values(v_game->>'gameId',(v_game->>'season')::smallint,(v_game->>'week')::smallint,coalesce((v_game->>'seasonType')::smallint,2),(v_game->>'kickoff')::timestamptz,v_game->>'homeTeam',v_game->>'awayTeam',coalesce(v_game->>'status','scheduled'),coalesce(v_game->>'source','dash'))
      on conflict(game_id) do update set kickoff=excluded.kickoff,home_team=excluded.home_team,away_team=excluded.away_team,status=excluded.status,source=excluded.source,updated_at=now();
      v_games:=v_games+1;
    end if;
  end loop;
  for v_player in select value from jsonb_array_elements(p_players) loop
    select id into v_player_id from public.nfl_players where source_player_id=v_player->>'sourcePlayerId' and season=(v_player->>'season')::smallint limit 1;
    if v_player_id is not null then
      insert into public.nfl_player_week_stats(player_id,season,week,game_id,stats,projected_points,dash_score,status)
      values(v_player_id,(v_player->>'season')::smallint,(v_player->>'week')::smallint,nullif(v_player->>'gameId',''),coalesce(v_player->'stats','{}'::jsonb),nullif(v_player->>'projectedPoints','')::numeric,nullif(v_player->>'dashScore','')::numeric,coalesce(v_player->>'status','scheduled'))
      on conflict(player_id,season,week) do update set game_id=excluded.game_id,stats=excluded.stats,projected_points=excluded.projected_points,dash_score=excluded.dash_score,status=excluded.status,updated_at=now();
      v_players:=v_players+1;
    end if;
  end loop;
  update public.fantasy_lineup_slots l set locked_at=g.kickoff from public.nfl_players p join public.nfl_week_games g on (g.home_team=p.team or g.away_team=p.team)
    where l.player_id=p.id and l.season=g.season and l.week=g.week and g.kickoff<=now() and l.locked_at is null;
  return jsonb_build_object('games',v_games,'players',v_players);
end;
$$;

create or replace function public.refresh_fantasy_matchup_scores(p_league_id uuid,p_season smallint,p_week smallint)
returns integer language plpgsql security definer set search_path=public as $$
declare v_scoring text; v_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner or scoring service access required'; end if;
  select scoring into v_scoring from public.fantasy_leagues where id=p_league_id;
  update public.fantasy_matchups m set
    home_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week where l.team_id=m.home_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR')),0),
    away_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week where l.team_id=m.away_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR')),0),
    status=case when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.status='live') then 'live' when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week) and not exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.status<>'final') then 'final' else 'scheduled' end
    where m.league_id=p_league_id and m.season=p_season and m.week=p_week;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.refresh_all_fantasy_matchup_scores(p_season smallint,p_week smallint)
returns integer language plpgsql security definer set search_path=public as $$
declare v_league record; v_total integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Scoring service access required'; end if;
  for v_league in select distinct league_id from public.fantasy_matchups where season=p_season and week=p_week loop
    v_total:=v_total+public.refresh_fantasy_matchup_scores(v_league.league_id,p_season,p_week);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.refresh_all_fantasy_matchup_scores(smallint,smallint) from public;
grant execute on function public.sync_nfl_player_catalog(jsonb) to authenticated,service_role;
grant execute on function public.sync_nfl_week_feed(jsonb,jsonb) to authenticated,service_role;
grant execute on function public.refresh_fantasy_matchup_scores(uuid,smallint,smallint) to authenticated,service_role;
grant execute on function public.refresh_all_fantasy_matchup_scores(smallint,smallint) to service_role;
