-- NFL SYNC STOPS REWRITING ROWS THAT DID NOT CHANGE, AND ONE BAD WAIVER CLAIM CAN NO LONGER STALL EVERY LEAGUE (2026-10-26, Supabase audit
-- items #84 / #98 / #101).
--
-- PART 1 -- sync_nfl_player_catalog and sync_nfl_week_feed were plain "insert ... on conflict do update", so every call rewrote every row
--   it was handed, changed or not (2.3M updates on ~5,300 rows lifetime; 448 of 760 players stamped "updated" in one hour with no game
--   live). Measured before this change by feeding the functions rows identical to what is stored: 50 of 50 catalog rows, 20 of 20 game
--   rows and 50 of 50 stat lines were rewritten. Now each upsert has a WHERE that is true only when a stored value differs, so an
--   unchanged row is left alone: no new row version, no dead row, no index write. The counters the functions return are unchanged (they
--   still count rows accepted), and so are the lineup-lock step and every other line. The one reader of updated_at on these tables
--   (matchup/page.js:109) selects it and never shows it.
--
-- PART 2 -- fantasy_waiver_claims had UNIQUE (team_id, player_id, status). That was meant to stop two PENDING claims for one player,
--   but it also applies to the finished states: a team's second rejected / awarded / cancelled claim for the same player violates it.
--   When that happened inside process_all_fantasy_waivers the error cancelled the whole run (every league), and the claim stayed
--   pending to fail again next run. cancel_fantasy_waiver_claim would raise the same raw error to the user. Now the rule is a partial
--   unique index on pending claims only (submit_fantasy_waiver_claim still turns it into 'You already have a pending claim for that
--   player'), and process_all_fantasy_waivers runs each league in its own sub-transaction so a failure in one league is logged as a
--   WARNING (Supabase Postgres logs) and the others still process. Nothing else about waivers changes. The 2 rows that exist today
--   (both rejected) fit the new rule.
--
-- RUN: applied live 2026-10-26 (by Claude, Donovan's go-ahead). Idempotent: create or replace, drop if exists, create if not exists.
-- PROBE: select (select indexdef from pg_indexes where indexname = 'fantasy_waiver_claims_one_pending') as new_rule,
--               (select count(*) from pg_constraint where conname = 'fantasy_waiver_claims_team_id_player_id_status_key') as old_rule_gone_if_0,
--               pg_get_functiondef('public.sync_nfl_player_catalog(jsonb)'::regprocedure) like '%is distinct from%' as catalog_guard,
--               pg_get_functiondef('public.sync_nfl_week_feed(jsonb,jsonb)'::regprocedure) like '%is distinct from%' as feed_guard;
--          -- new_rule shows the partial index, old_rule_gone_if_0 = 0, both guards true.
-- UNDO: re-run the function bodies from 202609121500 / 202608310001 / 202609070100 (the previous versions have no WHERE), then
--         drop index if exists public.fantasy_waiver_claims_one_pending;
--         alter table public.fantasy_waiver_claims add constraint fantasy_waiver_claims_team_id_player_id_status_key
--           unique nulls not distinct (team_id, player_id, status);
--       and put process_all_fantasy_waivers back to a plain loop (body in the git history of this file's parent commit).

-- ---------------------------------------------------------------------------------------------------------------------------------
-- PART 1a: player catalog -- write a row only when a stored value differs
-- ---------------------------------------------------------------------------------------------------------------------------------
create or replace function public.sync_nfl_player_catalog(p_catalog jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_item jsonb; v_count integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Scoring service access required';
  end if;
  if jsonb_typeof(p_catalog)<>'array' or jsonb_array_length(p_catalog)>2000 then raise exception 'Invalid player catalog'; end if;
  for v_item in select value from jsonb_array_elements(p_catalog) loop
    if coalesce(v_item->>'position','') in ('QB','RB','WR','TE','K','DEF') and coalesce(v_item->>'sourcePlayerId','')<>'' and coalesce(v_item->>'name','')<>'' then
      insert into public.nfl_players(source,source_player_id,season,name,position,team,active,injury_status,source_payload,updated_at)
      values(coalesce(v_item->>'source','dash'),v_item->>'sourcePlayerId',(v_item->>'season')::smallint,left(v_item->>'name',100),v_item->>'position',nullif(v_item->>'team',''),coalesce((v_item->>'active')::boolean,true),nullif(v_item->>'injuryStatus',''),coalesce(v_item->'analytics','{}'::jsonb),now())
      on conflict(source,source_player_id,season) do update set name=excluded.name,position=excluded.position,team=excluded.team,active=excluded.active,injury_status=excluded.injury_status,source_payload=excluded.source_payload,updated_at=now()
      where (nfl_players.name,nfl_players.position,nfl_players.team,nfl_players.active,nfl_players.injury_status,nfl_players.source_payload)
            is distinct from (excluded.name,excluded.position,excluded.team,excluded.active,excluded.injury_status,excluded.source_payload);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- PART 1b: week feed (games, player stat lines) -- same rule. The lineup-lock update at the end is untouched.
-- ---------------------------------------------------------------------------------------------------------------------------------
create or replace function public.sync_nfl_week_feed(p_games jsonb, p_players jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      on conflict(game_id) do update set season=excluded.season,week=excluded.week,season_type=excluded.season_type,kickoff=excluded.kickoff,home_team=excluded.home_team,away_team=excluded.away_team,status=excluded.status,source=excluded.source,updated_at=now()
      where (nfl_week_games.season,nfl_week_games.week,nfl_week_games.season_type,nfl_week_games.kickoff,nfl_week_games.home_team,nfl_week_games.away_team,nfl_week_games.status,nfl_week_games.source)
            is distinct from (excluded.season,excluded.week,excluded.season_type,excluded.kickoff,excluded.home_team,excluded.away_team,excluded.status,excluded.source);
      v_games:=v_games+1;
    end if;
  end loop;
  for v_player in select value from jsonb_array_elements(p_players) loop
    select id into v_player_id from public.nfl_players where source='dash' and source_player_id=v_player->>'sourcePlayerId' and season=(v_player->>'season')::smallint;
    if v_player_id is not null then
      insert into public.nfl_player_week_stats(player_id,season,week,game_id,stats,projected_points,dash_score,status)
      values(v_player_id,(v_player->>'season')::smallint,(v_player->>'week')::smallint,v_player->>'gameId',coalesce(v_player->'stats','{}'::jsonb),nullif(v_player->>'projectedPoints','')::numeric,nullif(v_player->>'dashScore','')::numeric,coalesce(v_player->>'status','scheduled'))
      on conflict(player_id,season,week) do update set game_id=excluded.game_id,stats=excluded.stats,projected_points=excluded.projected_points,dash_score=excluded.dash_score,status=excluded.status,updated_at=now()
      where (nfl_player_week_stats.game_id,nfl_player_week_stats.stats,nfl_player_week_stats.projected_points,nfl_player_week_stats.dash_score,nfl_player_week_stats.status)
            is distinct from (excluded.game_id,excluded.stats,excluded.projected_points,excluded.dash_score,excluded.status);
      v_players:=v_players+1;
    end if;
  end loop;
  update public.fantasy_lineup_slots l set locked_at=g.kickoff from public.nfl_players p join public.nfl_week_games g on (g.home_team=p.team or g.away_team=p.team)
    where l.player_id=p.id and l.season=g.season and l.week=g.week and g.season_type=2 and g.kickoff<=now() and l.locked_at is null;
  return jsonb_build_object('games',v_games,'players',v_players);
end;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- PART 2a: waiver claims -- "one pending claim per team per player" instead of "one claim per team, player and status"
-- (drop + create run in this one transaction, so there is no moment without a rule)
-- ---------------------------------------------------------------------------------------------------------------------------------
alter table public.fantasy_waiver_claims drop constraint if exists fantasy_waiver_claims_team_id_player_id_status_key;
create unique index if not exists fantasy_waiver_claims_one_pending
  on public.fantasy_waiver_claims (team_id, player_id) where status = 'pending';

-- ---------------------------------------------------------------------------------------------------------------------------------
-- PART 2b: process every league on its own, so one league's failure is a WARNING and the rest still go
-- ---------------------------------------------------------------------------------------------------------------------------------
create or replace function public.process_all_fantasy_waivers()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_league uuid; v_total integer:=0;
begin
  for v_league in
    select distinct c.league_id from public.fantasy_waiver_claims c
      join public.fantasy_leagues l on l.id=c.league_id and l.status='active'
      where c.status='pending' and c.process_after<=now()
  loop
    begin
      v_total := v_total + public.process_fantasy_waivers_unchecked(v_league);
    exception when others then
      raise warning 'process_all_fantasy_waivers: league % skipped (% / %)', v_league, sqlstate, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$function$;
