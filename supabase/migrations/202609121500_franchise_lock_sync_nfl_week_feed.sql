-- CLOSE THE LANDMINE 202609071000 KNOWINGLY LEFT IN sync_nfl_week_feed.
--
-- 202609071000 fixed the real hole -- any authenticated user who creates a
-- league becomes commissioner of SOMETHING, and the guard on
-- sync_nfl_player_catalog / sync_nfl_week_feed accepted "commissioner of
-- SOME league," no league_id anywhere in it -- by revoking EXECUTE on both
-- functions from `authenticated` entirely. That revoke is the actual
-- protection: Postgres checks function-level EXECUTE before the body ever
-- runs, so the body's own `if` no longer decides anything for an
-- authenticated caller.
--
-- sync_nfl_player_catalog's body was rewritten to match (service_role only).
-- sync_nfl_week_feed's was deliberately left alone -- that migration's own
-- comment says so: "copying it forward to change one line is how two
-- versions of a function end up in the migration history disagreeing... The
-- revoke is enough for it." True today. Not true the day somebody writes
-- `grant execute on function sync_nfl_week_feed ... to authenticated` for
-- some unrelated reason without knowing this history -- exactly the
-- scenario that comment warns about. The body still has the original
-- "commissioner of ANY league" branch sitting live, one grant away from
-- mattering again.
--
-- Fix: same shape sync_nfl_player_catalog already has -- service_role only,
-- no commissioner branch at all. Confirmed nothing legitimate needs it:
-- this function's only two real callers (app/api/fantasy/scoring/route.js's
-- cron, and the Coach page's "Refresh NFL feed & locks" button) both now go
-- through a service-role client -- the Coach page's own actions.js was
-- calling this as the signed-in user with no league-scoped check at all
-- until the same pass that added this migration, which means every press of
-- that button has been failing outright with a permission error since
-- 202609071000's revoke landed (a real regression from the security fix,
-- caught while fixing this). See that file's own commit for the site-side
-- half of this pass.
--
-- Everything below this line except the `if` guard is byte-identical to
-- 202609070100 -- not rewritten, not re-derived, copied forward on purpose
-- per that file's own stated reasoning for why two copies should never
-- quietly diverge.
create or replace function public.sync_nfl_week_feed(p_games jsonb,p_players jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game jsonb; v_player jsonb; v_player_id uuid; v_games integer:=0; v_players integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Scoring service access required';
  end if;
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
  -- LOCK HIM AT THE GAME HE IS ACTUALLY IN (2026-09-07). Unchanged from
  -- 202609070100 -- see that file for why this predicate exists.
  update public.fantasy_lineup_slots l set locked_at=g.kickoff
    from public.nfl_player_week_stats s
    join public.nfl_week_games g on g.game_id=s.game_id
    where l.player_id=s.player_id and l.season=s.season and l.week=s.week
      and g.season_type=2 and g.kickoff<=now() and l.locked_at is null;
  -- Fallback, unchanged, for a slot with no week row -- someone the payload has
  -- stopped carrying. It can only reach rows the statement above did not, so it
  -- adds nothing new and takes nothing away.
  update public.fantasy_lineup_slots l set locked_at=g.kickoff from public.nfl_players p join public.nfl_week_games g on (g.home_team=p.team or g.away_team=p.team)
    where l.player_id=p.id and l.season=g.season and l.week=g.week and g.season_type=2 and g.kickoff<=now() and l.locked_at is null;
  return jsonb_build_object('games',v_games,'players',v_players);
end;
$$;

-- Grants already correct since 202609071000 (this function is
-- service_role-only there). Restated here so this file is a complete,
-- self-contained record of the intended access rather than a silent
-- assumption about a grant made five days and several migrations earlier.
revoke all on function public.sync_nfl_week_feed(jsonb,jsonb) from public;
revoke execute on function public.sync_nfl_week_feed(jsonb,jsonb) from authenticated;
grant execute on function public.sync_nfl_week_feed(jsonb,jsonb) to service_role;
