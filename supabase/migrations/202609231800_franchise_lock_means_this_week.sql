-- ═══════════════════════════════════════════════════════════════════════════
-- FRANCHISE: "A locked player cannot be dropped" -- for a game from two weeks ago
-- (2026-09-23)
--
-- Donovan, Week 3 Wednesday, no game kicked off yet: every Drop failed with
-- "A locked player cannot be dropped".
--
-- The lock check in the drop, the add-with-drop, the waiver run and the trade
-- review was:
--
--     exists(select 1 from fantasy_lineup_slots
--            where team_id=... and player_id=... and locked_at is not null)
--
-- with NO week in it. Lineup rows are kept per week and locked_at stays set
-- forever (it is the record of what scored). So anyone who started a game in
-- Week 1 or 2 was locked for the rest of the season -- i.e. nearly every
-- player anyone would want to drop. The lineup screen itself always scoped by
-- week (set_fantasy_lineup_slot checks `week=p_week`); these four never did.
--
-- fantasy_player_locked_now(team, player) is the rule they meant: locked only
-- in the CURRENT week (the latest regular-season week with a kickoff behind
-- us), and only while that week still has a game that is not final. Past
-- weeks never block. Old locked_at values are untouched -- they still guard
-- the lineup history and the scores read from it.
--
-- Function bodies below are copied from their latest definitions by script;
-- the ONLY change in each is the lock predicate -> fantasy_player_locked_now().
-- CREATE OR REPLACE keeps the existing grants.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fantasy_player_locked_now(p_team uuid, p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fantasy_lineup_slots l
    where l.team_id = p_team and l.player_id = p_player and l.locked_at is not null
      and l.week = (select max(g.week) from public.nfl_week_games g
                    where g.season = l.season and g.season_type = 2 and g.kickoff <= now())
      and exists (select 1 from public.nfl_week_games g
                  where g.season = l.season and g.season_type = 2 and g.week = l.week and g.status <> 'final')
  )
$$;
revoke all on function public.fantasy_player_locked_now(uuid, uuid) from public;


-- ── add_fantasy_free_agent (from 202608260003) ──
create or replace function public.add_fantasy_free_agent(
  p_league_id uuid, p_player_id uuid, p_drop_player_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_entry uuid; v_count integer; v_league public.fantasy_leagues%rowtype;
begin
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  select id into v_team from public.fantasy_teams where league_id=p_league_id and owner_id=auth.uid() for update;
  if v_team is null then raise exception 'Team ownership required'; end if;
  if v_league.status<>'active' then raise exception 'Free agency opens after the draft'; end if;
  if not exists(select 1 from public.nfl_players where id=p_player_id and active) then raise exception 'Player unavailable'; end if;
  if exists(select 1 from public.fantasy_roster_entries where league_id=p_league_id and player_id=p_player_id and released_at is null)
    then raise exception 'That player is already rostered'; end if;
  if exists(select 1 from public.fantasy_player_availability where league_id=p_league_id and player_id=p_player_id and waiver_until>now())
    then raise exception 'That player must clear waivers first'; end if;
  select count(*) into v_count from public.fantasy_roster_entries where team_id=v_team and released_at is null;
  if v_count>=15 and p_drop_player_id is null then raise exception 'Choose a player to drop from your full roster'; end if;
  if p_drop_player_id is not null then
    if public.fantasy_player_locked_now(v_team, p_drop_player_id)
      then raise exception 'A locked player cannot be dropped'; end if;
    update public.fantasy_roster_entries set released_at=now() where team_id=v_team and player_id=p_drop_player_id and released_at is null;
    if not found then raise exception 'Drop player is not on your roster'; end if;
    delete from public.fantasy_lineup_slots where team_id=v_team and player_id=p_drop_player_id and locked_at is null;
    insert into public.fantasy_player_availability(league_id,player_id,waiver_until)
      values(p_league_id,p_drop_player_id,now()+interval '24 hours')
      on conflict(league_id,player_id) do update set waiver_until=excluded.waiver_until,updated_at=now();
  end if;
  insert into public.fantasy_roster_entries(league_id,team_id,player_id,acquired_via)
    values(p_league_id,v_team,p_player_id,'free_agent') returning id into v_entry;
  delete from public.fantasy_player_availability where league_id=p_league_id and player_id=p_player_id;
  insert into public.fantasy_transactions(league_id,team_id,transaction_type,added_player_id,dropped_player_id)
    values(p_league_id,v_team,'free_agent',p_player_id,p_drop_player_id);
  return v_entry;
end;
$$;


-- ── process_fantasy_waivers_unchecked (from 202609140200) ──
create or replace function public.process_fantasy_waivers_unchecked(p_league_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_claim public.fantasy_waiver_claims%rowtype; v_count integer; v_awarded integer:=0; v_max_priority integer;
begin
  for v_claim in select c.* from public.fantasy_waiver_claims c join public.fantasy_teams t on t.id=c.team_id
    where c.league_id=p_league_id and c.status='pending' and c.process_after<=now()
    order by c.process_after,t.waiver_priority,c.created_at for update of c loop
    if exists(select 1 from public.fantasy_roster_entries where league_id=p_league_id and player_id=v_claim.player_id and released_at is null) then
      update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id;
      continue;
    end if;
    select count(*) into v_count from public.fantasy_roster_entries where team_id=v_claim.team_id and released_at is null;
    if v_count>=15 and v_claim.drop_player_id is null then
      update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id;
      continue;
    end if;
    if v_claim.drop_player_id is not null then
      if public.fantasy_player_locked_now(v_claim.team_id, v_claim.drop_player_id) then
        update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id; continue;
      end if;
      update public.fantasy_roster_entries set released_at=now() where team_id=v_claim.team_id and player_id=v_claim.drop_player_id and released_at is null;
      if not found then update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id; continue; end if;
      delete from public.fantasy_lineup_slots where team_id=v_claim.team_id and player_id=v_claim.drop_player_id and locked_at is null;
      insert into public.fantasy_player_availability(league_id,player_id,waiver_until)
        values(p_league_id,v_claim.drop_player_id,now()+interval '24 hours')
        on conflict(league_id,player_id) do update set waiver_until=excluded.waiver_until,updated_at=now();
    end if;
    insert into public.fantasy_roster_entries(league_id,team_id,player_id,acquired_via)
      values(p_league_id,v_claim.team_id,v_claim.player_id,'waiver');
    update public.fantasy_waiver_claims set status='awarded',processed_at=now() where id=v_claim.id;
    update public.fantasy_waiver_claims set status='rejected',processed_at=now()
      where league_id=p_league_id and player_id=v_claim.player_id and status='pending' and id<>v_claim.id;
    delete from public.fantasy_player_availability where league_id=p_league_id and player_id=v_claim.player_id;
    select coalesce(max(waiver_priority),0)+1 into v_max_priority from public.fantasy_teams where league_id=p_league_id;
    update public.fantasy_teams set waiver_priority=v_max_priority where id=v_claim.team_id;
    insert into public.fantasy_transactions(league_id,team_id,transaction_type,added_player_id,dropped_player_id)
      values(p_league_id,v_claim.team_id,'waiver',v_claim.player_id,v_claim.drop_player_id);
    v_awarded:=v_awarded+1;
  end loop;
  return v_awarded;
end;
$$;


-- ── drop_fantasy_player (from 202609071000) ──
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
  if public.fantasy_player_locked_now(v_team, p_player_id)
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


-- ── review_fantasy_trade (from 202609231200) ──
create or replace function public.review_fantasy_trade(p_trade_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer set search_path=public as $$
declare
  v_trade public.fantasy_trades%rowtype;
  v_item public.fantasy_trade_items%rowtype;
  v_reviewer_team uuid;
  v_proposer text;
  v_recipient text;
  v_out integer;
  v_in integer;
  v_cap text;
begin
  select * into v_trade from public.fantasy_trades where id=p_trade_id for update;
  if not found or not public.is_fantasy_commissioner(v_trade.league_id) then raise exception 'Commissioner access required'; end if;
  if v_trade.status<>'accepted' then raise exception 'Only accepted trades can be reviewed'; end if;
  if p_decision not in ('approve','veto') then raise exception 'Invalid review decision'; end if;

  select id into v_reviewer_team from public.fantasy_teams
    where league_id=v_trade.league_id and owner_id=auth.uid();

  if p_decision='veto' then
    update public.fantasy_trades set status='vetoed',commissioner_note=left(trim(coalesce(p_note,'')),280),
      reviewed_by=auth.uid(),reviewed_at=now() where id=p_trade_id;
    return;
  end if;
  for v_item in select * from public.fantasy_trade_items where trade_id=p_trade_id for update loop
    if not exists(select 1 from public.fantasy_roster_entries where team_id=v_item.from_team_id and player_id=v_item.player_id and released_at is null)
      then raise exception 'A traded player is no longer on the expected roster'; end if;
    if public.fantasy_player_locked_now(v_item.from_team_id, v_item.player_id)
      then raise exception 'A locked player cannot be traded'; end if;
  end loop;
  -- NEW: the cap again, against the rosters as they are NOW -- a waiver or
  -- free-agent add may have landed since the trade was proposed.
  select count(*) filter (where from_team_id=v_trade.proposer_team_id),
         count(*) filter (where to_team_id=v_trade.proposer_team_id)
    into v_out, v_in from public.fantasy_trade_items where trade_id=p_trade_id;
  v_cap := public.fantasy_trade_cap_error(v_trade.proposer_team_id, v_trade.recipient_team_id, v_out, v_in);
  if v_cap is not null then
    raise exception 'Cannot approve: %', replace(replace(v_cap,'your roster','the proposing roster'),'their roster','the receiving roster');
  end if;
  for v_item in select * from public.fantasy_trade_items where trade_id=p_trade_id loop
    update public.fantasy_roster_entries set released_at=now() where team_id=v_item.from_team_id and player_id=v_item.player_id and released_at is null;
    delete from public.fantasy_lineup_slots where team_id=v_item.from_team_id and player_id=v_item.player_id and locked_at is null;
    insert into public.fantasy_roster_entries(league_id,team_id,player_id,acquired_via)
      values(v_trade.league_id,v_item.to_team_id,v_item.player_id,'trade');
  end loop;
  insert into public.fantasy_transactions(league_id,team_id,transaction_type,details)
    values(v_trade.league_id,v_trade.proposer_team_id,'trade',jsonb_build_object('trade_id',p_trade_id)),
      (v_trade.league_id,v_trade.recipient_team_id,'trade',jsonb_build_object('trade_id',p_trade_id));
  update public.fantasy_trades set status='completed',commissioner_note=left(trim(coalesce(p_note,'')),280),
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_trade_id;

  if v_reviewer_team is not null
     and v_reviewer_team in (v_trade.proposer_team_id, v_trade.recipient_team_id) then
    select name into v_proposer from public.fantasy_teams where id=v_trade.proposer_team_id;
    select name into v_recipient from public.fantasy_teams where id=v_trade.recipient_team_id;
    insert into public.fantasy_feed_posts(league_id,author_id,team_id,body)
      values(v_trade.league_id, auth.uid(), v_reviewer_team,
        left('Commissioner approved a trade they are part of: ' || coalesce(v_proposer,'a team')
             || ' and ' || coalesce(v_recipient,'a team') || '.', 500));
  end if;
end;
$$;
