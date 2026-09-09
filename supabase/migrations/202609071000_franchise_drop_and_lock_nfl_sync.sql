-- ═══════════════════════════════════════════════════════════════════════════
-- TWO THINGS, 2026-09-07
--
--   1. You can finally drop a player without adding one.
--   2. A league commissioner can no longer overwrite the NFL data every league
--      in the product reads.
--
-- Both are one file because they both need a hand-run and asking twice is how
-- the second one waits another week.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · DROP A PLAYER ───────────────────────────────────────────────────────
--
-- Donovan: "removing players should be easier." It was not hard, it was
-- IMPOSSIBLE. `p_drop_player_id` exists only as a parameter of
-- add_fantasy_free_agent and claim_fantasy_waiver, so the only way to release
-- a man was to sign someone else in the same motion. A full roster with a
-- player you no longer want and nobody worth adding had no way out.
--
-- Everything here is lifted from the drop half of add_fantasy_free_agent so
-- the two behave identically: same lock rule, same 24-hour waiver window, same
-- transaction row. The only thing removed is the add.
create or replace function public.drop_fantasy_player(
  p_league_id uuid, p_player_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_entry uuid;
begin
  -- Your own team in this league, by your own session. A commissioner has no
  -- special power here on purpose: dropping someone else's player is a
  -- different action, and it should look different when it exists.
  select id into v_team from public.fantasy_teams
    where league_id = p_league_id and owner_id = auth.uid();
  if v_team is null then raise exception 'You do not have a team in this league'; end if;

  if not exists(select 1 from public.fantasy_roster_entries
    where team_id = v_team and player_id = p_player_id and released_at is null)
    then raise exception 'That player is not on your roster'; end if;

  -- A player whose game has kicked off is locked into the week's scoring. Let
  -- him go now and the lineup slot he was filling scores nothing, retroactively.
  if exists(select 1 from public.fantasy_lineup_slots
    where team_id = v_team and player_id = p_player_id and locked_at is not null)
    then raise exception 'A locked player cannot be dropped'; end if;

  update public.fantasy_roster_entries set released_at = now()
    where team_id = v_team and player_id = p_player_id and released_at is null
    returning id into v_entry;

  delete from public.fantasy_lineup_slots
    where team_id = v_team and player_id = p_player_id and locked_at is null;

  insert into public.fantasy_player_availability(league_id, player_id, waiver_until)
    values (p_league_id, p_player_id, now() + interval '24 hours')
    on conflict(league_id, player_id) do update set waiver_until = excluded.waiver_until, updated_at = now();

  insert into public.fantasy_transactions(league_id, team_id, transaction_type, dropped_player_id)
    values (p_league_id, v_team, 'drop', p_player_id);

  return v_entry;
end;
$$;

revoke all on function public.drop_fantasy_player(uuid, uuid) from public;
grant execute on function public.drop_fantasy_player(uuid, uuid) to authenticated;


-- ── 2 · THE NFL CATALOG IS NOT A LEAGUE'S TO REWRITE ────────────────────────
--
-- sync_nfl_player_catalog and sync_nfl_week_feed write public.nfl_players and
-- public.nfl_week_games -- ONE global table each, read by every league in the
-- product and by TUDDY's boards. Their guard was:
--
--     auth.role() = 'service_role'
--     OR the caller is a commissioner of SOME league
--
-- with no league_id anywhere in it. Anyone can create a league; creating one
-- makes you its commissioner; being a commissioner of anything satisfied that
-- second branch. So any signed-up user was two clicks from calling
-- sync_nfl_player_catalog with a payload of their choosing and rewriting every
-- player's team, position, projection and active flag for everybody.
--
-- Nothing legitimate needs the commissioner branch. Both functions have
-- exactly one caller in the app (lib/fantasy/sync.js), reached from the
-- scoring cron and from the commissioner's "Refresh NFL players" button --
-- and as of this migration BOTH of those run through a service-role client
-- (app/fantasy/league/[leagueId]/actions.js was switched in the same commit,
-- after checking the caller is a commissioner OF THAT LEAGUE).
--
-- The EXECUTE grant is withdrawn from `authenticated` on BOTH functions, and
-- the guard inside sync_nfl_player_catalog is narrowed to service_role as
-- well. Either alone closes it; the pair means a future
-- `grant execute ... to authenticated` written from memory does not silently
-- reopen it.
--
-- sync_nfl_week_feed's body is deliberately NOT rewritten here. Its current
-- definition lives in 202609070100_franchise_lock_by_the_real_game.sql and
-- copying it forward to change one line is how two versions of a function end
-- up in the migration history disagreeing about everything else. The revoke
-- is enough for it.
create or replace function public.sync_nfl_player_catalog(p_catalog jsonb)
returns integer language plpgsql security definer set search_path=public as $$
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
      on conflict(source,source_player_id,season) do update set name=excluded.name,position=excluded.position,team=excluded.team,active=excluded.active,injury_status=excluded.injury_status,source_payload=excluded.source_payload,updated_at=now();
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.sync_nfl_player_catalog(jsonb) from public;
revoke execute on function public.sync_nfl_player_catalog(jsonb) from authenticated;
grant execute on function public.sync_nfl_player_catalog(jsonb) to service_role;

revoke all on function public.sync_nfl_week_feed(jsonb,jsonb) from public;
revoke execute on function public.sync_nfl_week_feed(jsonb,jsonb) from authenticated;
grant execute on function public.sync_nfl_week_feed(jsonb,jsonb) to service_role;


-- ── 3 · A COMMISSIONER CAN FIX A PICK THAT IS ALREADY MADE ──────────────────
--
-- Draft night, 2026-09-07. Goin 4 It's timer expired and the auto-pick took
-- James Cook. Donovan reached for commissioner_assign_fantasy_pick to put Drake
-- Maye there instead and could not: that function refuses any slot where
-- `player_id is not null`, by design. The only tool available fills an EMPTY
-- slot. There has never been one that fixes a filled one.
--
-- So the actual repair was three rows written by hand with a service key,
-- outside the app, with no transaction log and nothing in the feed. That is
-- not a workflow, it is an incident.
--
-- This is the missing verb. It swaps the player in a completed pick: the man
-- who was taken goes back to the pool, the new man joins that team, and the
-- draft's shape -- who picks when -- is untouched. It does NOT move the clock
-- or re-open the pick, because the pick happened; only its contents were wrong.
create or replace function public.commissioner_replace_fantasy_pick(
  p_league_id uuid, p_overall_pick integer, p_player_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_player public.nfl_players%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_outgoing uuid;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;

  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found then raise exception 'No draft board exists for this league'; end if;
  -- 'complete' is allowed on purpose: a bad auto-pick is usually noticed after
  -- the room empties, and that is exactly when it must still be fixable.
  if v_draft.status not in ('live','paused','complete') then raise exception 'The draft has not run'; end if;

  select * into v_pick from public.fantasy_draft_picks
    where draft_id = v_draft.id and overall_pick = p_overall_pick for update;
  if v_pick.id is null then raise exception 'That pick does not exist'; end if;
  if v_pick.player_id is null then
    raise exception 'That pick is still open — use the assignment panel for it';
  end if;
  v_outgoing := v_pick.player_id;
  if v_outgoing = p_player_id then raise exception 'That player already holds this pick'; end if;

  select * into v_player from public.nfl_players where id = p_player_id and active;
  if v_player.id is null then raise exception 'Player unavailable'; end if;

  select * into v_league from public.fantasy_leagues where id = p_league_id;
  if (v_player.position = 'K' and not v_league.has_kicker) or (v_player.position = 'DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;

  if public.fantasy_player_taken(p_league_id, v_draft.id, p_player_id)
    then raise exception 'That player is already on a roster'; end if;

  -- A player already locked into a scored lineup cannot be un-drafted: his
  -- points are in a matchup total that has been read.
  if exists(select 1 from public.fantasy_lineup_slots
    where team_id = v_pick.team_id and player_id = v_outgoing and locked_at is not null)
    then raise exception 'That player is locked into a lineup and cannot be replaced'; end if;

  update public.fantasy_draft_picks
    set player_id = p_player_id, assignment_type = 'manual', picked_at = coalesce(picked_at, now())
    where id = v_pick.id;

  update public.fantasy_roster_entries set released_at = now()
    where team_id = v_pick.team_id and player_id = v_outgoing and released_at is null;
  delete from public.fantasy_lineup_slots
    where team_id = v_pick.team_id and player_id = v_outgoing and locked_at is null;

  insert into public.fantasy_roster_entries(league_id, team_id, player_id, acquired_via)
    values (p_league_id, v_pick.team_id, p_player_id, 'commissioner');

  -- Straight back into the pool, not onto waivers. He was never really this
  -- team's player; the pick was a mistake being corrected, not a cut.
  delete from public.fantasy_draft_queue where draft_id = v_draft.id and player_id = p_player_id;
  delete from public.fantasy_player_availability where league_id = p_league_id and player_id = p_player_id;

  insert into public.fantasy_transactions(league_id, team_id, transaction_type, added_player_id, dropped_player_id)
    values (p_league_id, v_pick.team_id, 'commissioner', p_player_id, v_outgoing);

  return v_outgoing;
end;
$$;

revoke all on function public.commissioner_replace_fantasy_pick(uuid, integer, uuid) from public;
grant execute on function public.commissioner_replace_fantasy_pick(uuid, integer, uuid) to authenticated;
