-- FRANCHISE: lock a lineup slot at the game the player is actually in.
--
-- The lineup lock is what stops an owner editing a lineup after kickoff, and
-- it found the kickoff by joining nfl_players.team -- a catalog column that is
-- only as fresh as the last catalog sync, and frozen forever for anyone the
-- payload no longer carries. Match the wrong game and the slot locks at the
-- wrong time; late, and the owner can swap a player out after watching him
-- play. On a stale team that is on a bye, the slot never locks at all.
--
-- Only the lock predicate changes. Everything else in sync_nfl_week_feed is
-- byte-identical to 202608310001.

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
  -- LOCK HIM AT THE GAME HE IS ACTUALLY IN (2026-09-07).
  --
  -- This used to find the game by joining nfl_players.team, and that column is
  -- a catalog value: it is only as current as the last "Refresh NFL players",
  -- and for a man the payload no longer carries it is frozen at whatever team
  -- he was on when it last did. Nothing about it is per-week.
  --
  -- A slot matched to the wrong game locks at the wrong kickoff, and the
  -- direction that matters is late: his real game starts, he plays, and his
  -- slot is still editable because the game the stale team pointed at has not
  -- kicked off yet. The owner gets to move him out after seeing what he did.
  -- If the stale team is on a bye, there is no game at all and the slot never
  -- locks for the whole week.
  --
  -- nfl_player_week_stats.game_id is the right answer and it is written eight
  -- lines above this: it comes from the payload, per week, off the team the bot
  -- says he is on now. Verified against the failure directly -- a man whose
  -- catalog row still said KC while his week row said the Seattle game that had
  -- already kicked off stayed UNLOCKED under the old predicate and locks at his
  -- real kickoff under this one.
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
