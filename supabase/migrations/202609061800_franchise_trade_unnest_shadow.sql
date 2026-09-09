-- FRANCHISE — trades have never worked, and it is two identifiers (2026-09-06).
--
-- SYMPTOM: every trade proposal, of any player, by any owner, fails with
-- "An offered player is no longer on your roster." Verified live on the
-- BASEBALL league: a kicker and a running back, both plainly on the proposer's
-- own roster and both rendered by the page from the very rows the check reads,
-- rejected identically. The trade desk has never completed a deal.
--
-- CAUSE: name shadowing in propose_fantasy_trade (202608260004), here --
--
--   if exists(select 1 from unnest(p_offered_player_ids) id where not exists(
--     select 1 from public.fantasy_roster_entries r
--     where r.team_id = v_proposer and r.player_id = id and r.released_at is null))
--
-- The array is unnested as `id`. The correlated subquery then says
-- `r.player_id = id`, and Postgres resolves an unqualified name in the
-- INNERMOST scope first -- where `fantasy_roster_entries` has its own `id`
-- column, the primary key. So the predicate silently means
--
--   r.player_id = r.id
--
-- comparing a roster row's player to that row's own primary key. It is never
-- true, so `not exists` is always true, so the exception always fires. No
-- error, no ambiguity warning: Postgres considers the inner name to have won
-- fair and square.
--
-- Both roster checks carry it -- the offered side and the requested side. Only
-- the first is ever reached, which is why the message is always about the
-- offered player.
--
-- THE SAME SHAPE IS SAFE TWO FILES OVER. set_fantasy_draft_order unnests as
-- `x` and compares `t.id = x`; no table in scope has an `x` column, so it
-- resolves to the array element and works. The bug is not the pattern, it is
-- choosing an alias that collides with a real column name. Fixed here by
-- naming the column explicitly -- `as t(player_id)` would collide too, so the
-- alias is `offered(pid)` / `wanted(pid)` and every reference is qualified.
--
-- Nothing else in the function changes. Body copied verbatim from
-- 202608260004 with those two predicates corrected.

create or replace function public.propose_fantasy_trade(
  p_league_id uuid,
  p_recipient_team_id uuid,
  p_offered_player_ids uuid[],
  p_requested_player_ids uuid[],
  p_note text default ''
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_proposer uuid; v_trade uuid; v_player uuid;
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
