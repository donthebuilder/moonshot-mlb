-- ═══════════════════════════════════════════════════════════════════════════
-- FRANCHISE: nobody goes over 15, and a rostered man is never retired
-- (2026-09-23)
--
-- Found reproducing "the add and drop is not working": BASEBALL's iwwiw held
-- 16 players against a 15 cap, and two of them (Josh Jacobs, Zach Charbonnet)
-- had been retired out of the active catalog while still on the roster.
--
--   1. REPAIR. Every player on an active roster is active again. The retire
--      pass in syncPlayerCatalog retired anyone missing from this week's bot
--      slate, and the slate drops injured men. The app no longer does that
--      (same commit); this puts back the ones it already hid.
--   2. TRADES RESPECT THE CAP. review_fantasy_trade moved players with no
--      count check, so a 2-for-1 put the receiving team at 16. Checked when
--      the trade is proposed (early, clear error) and again when it is
--      approved (authoritative -- rosters change in between).
--   3. A DRAFT RESET CLEARS THE WHOLE ROSTER. It deleted only draft and
--      commissioner rows, so free-agent/waiver/trade rows survived the reset
--      and the redraft stacked 15 more on top of them. A reset is only
--      allowed before any game is played, so there is nothing to keep.
--
-- Bodies are copied from their latest definitions (review: 202609062000,
-- propose + reset: 202609062100); only the marked lines are new.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · REPAIR ──────────────────────────────────────────────────────────────
update public.nfl_players p set active = true, updated_at = now()
where p.active = false
  and exists (select 1 from public.fantasy_roster_entries r
              where r.player_id = p.id and r.released_at is null);


-- ── helper: would this trade put either side over 15? ───────────────────────
create or replace function public.fantasy_trade_cap_error(
  p_proposer uuid, p_recipient uuid, p_out_count integer, p_in_count integer
) returns text language plpgsql stable security definer set search_path = public as $$
declare v_prop integer; v_rec integer;
begin
  select count(*) into v_prop from public.fantasy_roster_entries where team_id = p_proposer and released_at is null;
  select count(*) into v_rec  from public.fantasy_roster_entries where team_id = p_recipient and released_at is null;
  -- A team already over the cap may still trade down; only an INCREASE past 15 is refused.
  if p_in_count > p_out_count and v_prop - p_out_count + p_in_count > 15 then
    return format('This trade would put your roster at %s players (max 15) — add players to your side or drop someone first',
                  v_prop - p_out_count + p_in_count);
  end if;
  if p_out_count > p_in_count and v_rec - p_in_count + p_out_count > 15 then
    return format('This trade would put their roster at %s players (max 15) — ask for more back or offer fewer',
                  v_rec - p_in_count + p_out_count);
  end if;
  return null;
end;
$$;
revoke all on function public.fantasy_trade_cap_error(uuid, uuid, integer, integer) from public;


-- ── 2a · propose_fantasy_trade (from 202609062100) ──────────────────────────
create or replace function public.propose_fantasy_trade(
  p_league_id uuid,
  p_recipient_team_id uuid,
  p_offered_player_ids uuid[],
  p_requested_player_ids uuid[],
  p_note text default ''
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_proposer uuid; v_trade uuid; v_player uuid; v_cap text;
begin
  select id into v_proposer from public.fantasy_teams where league_id=p_league_id and owner_id=auth.uid();
  if v_proposer is null then raise exception 'Team ownership required'; end if;
  if p_recipient_team_id=v_proposer or not exists(select 1 from public.fantasy_teams where id=p_recipient_team_id and league_id=p_league_id)
    then raise exception 'Choose another team in this league'; end if;
  if coalesce(array_length(p_offered_player_ids,1),0) not between 1 and 5
    or coalesce(array_length(p_requested_player_ids,1),0) not between 1 and 5
    then raise exception 'Choose 1 to 5 players on each side'; end if;
  if (select count(distinct pid) from unnest(p_offered_player_ids) as offered(pid))<>array_length(p_offered_player_ids,1)
    or (select count(distinct pid) from unnest(p_requested_player_ids) as wanted(pid))<>array_length(p_requested_player_ids,1)
    then raise exception 'A player can only appear once'; end if;
  if exists(select 1 from unnest(p_offered_player_ids) as offered(pid) where not exists(
    select 1 from public.fantasy_roster_entries r where r.team_id=v_proposer and r.player_id=offered.pid and r.released_at is null))
    then raise exception 'An offered player is no longer on your roster'; end if;
  if exists(select 1 from unnest(p_requested_player_ids) as wanted(pid) where not exists(
    select 1 from public.fantasy_roster_entries r where r.team_id=p_recipient_team_id and r.player_id=wanted.pid and r.released_at is null))
    then raise exception 'A requested player is no longer on that roster'; end if;
  -- NEW: the cap, checked up front.
  v_cap := public.fantasy_trade_cap_error(v_proposer, p_recipient_team_id,
             array_length(p_offered_player_ids,1), array_length(p_requested_player_ids,1));
  if v_cap is not null then raise exception '%', v_cap; end if;
  insert into public.fantasy_trades(league_id,proposer_team_id,recipient_team_id,note)
    values(p_league_id,v_proposer,p_recipient_team_id,left(trim(coalesce(p_note,'')),280)) returning id into v_trade;
  foreach v_player in array p_offered_player_ids loop
    insert into public.fantasy_trade_items(trade_id,from_team_id,to_team_id,player_id)
      values(v_trade,v_proposer,p_recipient_team_id,v_player);
  end loop;
  foreach v_player in array p_requested_player_ids loop
    insert into public.fantasy_trade_items(trade_id,from_team_id,to_team_id,player_id)
      values(v_trade,p_recipient_team_id,v_proposer,v_player);
  end loop;
  return v_trade;
end;
$$;
revoke all on function public.propose_fantasy_trade(uuid,uuid,uuid[],uuid[],text) from public;
grant execute on function public.propose_fantasy_trade(uuid,uuid,uuid[],uuid[],text) to authenticated;


-- ── 2b · review_fantasy_trade (from 202609062000) ───────────────────────────
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
    if exists(select 1 from public.fantasy_lineup_slots where team_id=v_item.from_team_id and player_id=v_item.player_id and locked_at is not null)
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
revoke all on function public.review_fantasy_trade(uuid,text,text) from public;
grant execute on function public.review_fantasy_trade(uuid,text,text) to authenticated;


-- ── 3 · reset_fantasy_draft (from 202609062100) ─────────────────────────────
create or replace function public.reset_fantasy_draft(p_league_id uuid, p_confirmation text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_league public.fantasy_leagues%rowtype;
  v_draft public.fantasy_drafts%rowtype;
  v_cleared integer := 0;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select * into v_league from public.fantasy_leagues where id = p_league_id for update;
  if not found then raise exception 'League not found'; end if;
  if coalesce(trim(p_confirmation),'') <> v_league.name then
    raise exception 'Type the league name exactly to reset the draft';
  end if;
  if exists (select 1 from public.fantasy_matchups where league_id = p_league_id and status <> 'scheduled') then
    raise exception 'This league has played games — the draft can no longer be reset';
  end if;

  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if found then
    delete from public.fantasy_draft_queue where draft_id = v_draft.id;
    update public.fantasy_draft_picks
      set player_id = null, picked_at = null, assignment_type = 'live'
      where draft_id = v_draft.id and player_id is not null;
    get diagnostics v_cleared = row_count;
    update public.fantasy_drafts
      set status = 'setup', current_overall_pick = 1, pick_deadline = null,
          started_at = null, completed_at = null
      where id = v_draft.id;
  end if;

  -- NEW: every roster row, not just draft/commissioner ones. A surviving
  -- free-agent or trade row plus a full 15-round redraft is how a team
  -- reached 16.
  delete from public.fantasy_roster_entries where league_id = p_league_id;
  delete from public.fantasy_lineup_slots
    where team_id in (select id from public.fantasy_teams where league_id = p_league_id);

  update public.fantasy_leagues set status = 'setup' where id = p_league_id;
  return v_cleared;
end;
$$;
revoke all on function public.reset_fantasy_draft(uuid,text) from public;
grant execute on function public.reset_fantasy_draft(uuid,text) to authenticated;
