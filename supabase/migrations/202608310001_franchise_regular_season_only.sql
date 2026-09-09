-- ── PRESEASON IS NOT WEEK 1 (2026-08-31) ────────────────────────────────────
--
-- Three functions treated (season, week) as the identity of a football week.
-- It is not. nfl_week_games carries a season_type, preseason weeks are ALSO
-- numbered 1, 2 and 3, and those rows are already in the table -- put there by
-- lib/fantasy/nflFeed.js, which deliberately falls back to preseason games when
-- no regular-season ones exist yet, and by the committed seed in
-- public/data/nfl/week.json.
--
-- So on 9 September, before a single regular-season snap:
--
--   1. EVERY LINEUP FOR WEEKS 1-3 WOULD ALREADY BE LOCKED. The lock sets
--      locked_at where kickoff <= now() with no season_type predicate, and
--      those preseason kickoffs are in August. set_fantasy_lineup_slot then
--      raises 'That lineup slot is locked' the first time anybody tries to
--      move a player. The scoring cron re-applies it every ten minutes, so it
--      would not have been fixable by hand either.
--
--   2. WEEK 1 COULD NEVER GO FINAL. The status case asks whether any game in
--      (season, week) is not final. The stale preseason rows are frozen at
--      'scheduled' forever -- sync_nfl_week_feed's on-conflict never
--      republishes a game the bot has stopped sending -- so the answer is
--      permanently yes. No recaps, no awards, no power rankings, for weeks 1-3
--      of the season.
--
--   3. PRESEASON STATS WOULD SCORE AS WEEK 1. nfl_player_week_stats is keyed
--      (player_id, season, week) with no season_type, so a camp body's August
--      line sits at week 1 and is summed into a real matchup.
--
-- Every fix here is one predicate. The cleanups at the bottom repair the rows
-- that are already wrong, and both are written to be safe to run twice.

-- ── 1. the feed, and the lock ───────────────────────────────────────────────
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
      -- season, week and season_type were NOT in this update list, so whatever
      -- a game_id was first written under was permanent. A game ingested with
      -- the wrong week could never be corrected by republishing it.
      on conflict(game_id) do update set season=excluded.season,week=excluded.week,season_type=excluded.season_type,kickoff=excluded.kickoff,home_team=excluded.home_team,away_team=excluded.away_team,status=excluded.status,source=excluded.source,updated_at=now();
      v_games:=v_games+1;
    end if;
  end loop;
  for v_player in select value from jsonb_array_elements(p_players) loop
    select id into v_player_id from public.nfl_players where source='dash' and source_player_id=v_player->>'sourcePlayerId' and season=(v_player->>'season')::smallint;
    if v_player_id is not null then
      insert into public.nfl_player_week_stats(player_id,season,week,game_id,stats,projected_points,dash_score,status)
      values(v_player_id,(v_player->>'season')::smallint,(v_player->>'week')::smallint,v_player->>'gameId',coalesce(v_player->'stats','{}'::jsonb),nullif(v_player->>'projectedPoints','')::numeric,nullif(v_player->>'dashScore','')::numeric,coalesce(v_player->>'status','scheduled'))
      on conflict(player_id,season,week) do update set game_id=excluded.game_id,stats=excluded.stats,projected_points=excluded.projected_points,dash_score=excluded.dash_score,status=excluded.status,updated_at=now();
      v_players:=v_players+1;
    end if;
  end loop;
  -- THE PREDICATE THIS WHOLE MIGRATION EXISTS FOR.
  update public.fantasy_lineup_slots l set locked_at=g.kickoff from public.nfl_players p join public.nfl_week_games g on (g.home_team=p.team or g.away_team=p.team)
    where l.player_id=p.id and l.season=g.season and l.week=g.week and g.season_type=2 and g.kickoff<=now() and l.locked_at is null;
  return jsonb_build_object('games',v_games,'players',v_players);
end;
$$;

-- ── 2. the scores, and whether the week is over ─────────────────────────────
create or replace function public.refresh_fantasy_matchup_scores(p_league_id uuid,p_season smallint,p_week smallint)
returns integer language plpgsql security definer set search_path=public as $$
declare v_scoring text; v_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner or scoring service access required'; end if;
  select scoring into v_scoring from public.fantasy_leagues where id=p_league_id;
  update public.fantasy_matchups m set
    -- A stat row whose game is preseason no longer counts. left join, because
    -- a row with a null game_id predates the feed and is assumed regular.
    home_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week left join public.nfl_week_games sg on sg.game_id=s.game_id where l.team_id=m.home_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR') and coalesce(sg.season_type,2)=2),0),
    away_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week left join public.nfl_week_games sg on sg.game_id=s.game_id where l.team_id=m.away_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR') and coalesce(sg.season_type,2)=2),0),
    status=case when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.season_type=2 and g.status='live') then 'live' when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.season_type=2) and not exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.season_type=2 and g.status<>'final') then 'final' else 'scheduled' end
    where m.league_id=p_league_id and m.season=p_season and m.week=p_week;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- ── 3. repair what is already wrong ─────────────────────────────────────────
--
-- Any lock that no REGULAR-SEASON game justifies is released. Written as a
-- "cannot be justified" test rather than "was caused by preseason" so it is
-- correct whatever put the timestamp there, and safe to run again.
update public.fantasy_lineup_slots l set locked_at=null
where l.locked_at is not null
  and not exists (
    select 1 from public.nfl_players p
    join public.nfl_week_games g on (g.home_team=p.team or g.away_team=p.team)
    where p.id=l.player_id and g.season=l.season and g.week=l.week
      and g.season_type=2 and g.kickoff<=now());

-- Preseason lines squatting on regular-season week numbers. Precise: only rows
-- whose own game is preseason, which the foreign key guarantees is answerable.
delete from public.nfl_player_week_stats s
using public.nfl_week_games g
where g.game_id=s.game_id and g.season_type<>2;
