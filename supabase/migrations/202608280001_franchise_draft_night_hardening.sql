-- Franchise draft-night hardening, 2026-08-28.
--
-- Found by auditing the draft path end to end before a real 10-team draft.
-- Four defects, all in the live-draft functions. Each one is replayed in full
-- (create or replace) rather than patched, so this file is the whole truth
-- about these functions after it runs.
--
-- 1. EXHAUSTION WAS AN UNRECOVERABLE FREEZE. run_expired_fantasy_auto_pick
--    raised 'No eligible players remain' when the pool ran dry. A raise aborts
--    the transaction, so current_overall_pick never advanced and pick_deadline
--    stayed in the past forever: every client retried, every retry failed, and
--    there was no way out short of raw SQL. It now COMPLETES the draft
--    instead. A short draft beats a hung one.
--
-- 2. A FILLED PICK COULD BE OVERWRITTEN. Neither make_fantasy_draft_pick nor
--    run_expired_fantasy_auto_pick checked that the pick on the clock was
--    still empty. Combined with (4), a commissioner assignment made during a
--    pause was silently overwritten by the next owner -- the player vanished
--    from the board but his roster row survived, so the board and the roster
--    disagreed permanently.
--
-- 3. ASSIGNING WHILE PAUSED LEFT THE CLOCK BEHIND. commissioner_assign only
--    advanced current_overall_pick when status = 'live', so an assignment made
--    while paused (the natural moment to cover an absent owner) filled the
--    slot without moving on. Now it advances whenever it fills the pick that
--    is on the clock, live or paused.
--
-- 4. A DEAD `found` CHECK. commissioner_assign tested `found` after selecting
--    the LEAGUE, so the player check never ran: an inactive player passed
--    straight through with an all-NULL row, and the position guard on a NULL
--    position evaluated NULL and passed too.

create or replace function public.run_expired_fantasy_auto_pick(p_league_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_player uuid;
  v_next integer;
  v_last integer;
begin
  if not public.is_fantasy_league_member(p_league_id) then raise exception 'League access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found or v_draft.status <> 'live' then raise exception 'The draft is not live'; end if;
  if v_draft.pick_deadline is null or v_draft.pick_deadline > now() then raise exception 'The pick timer has not expired'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id = v_draft.id
    and overall_pick = v_draft.current_overall_pick for update;
  -- (2) never fill a pick that already has someone in it
  if v_pick.id is null or v_pick.player_id is not null then raise exception 'That pick is no longer on the clock'; end if;
  select * into v_league from public.fantasy_leagues where id = p_league_id;

  select q.player_id into v_player from public.fantasy_draft_queue q
    join public.nfl_players p on p.id = q.player_id and p.active
    where q.draft_id = v_draft.id and q.team_id = v_pick.team_id
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not exists (select 1 from public.fantasy_draft_picks dp where dp.draft_id = v_draft.id and dp.player_id = p.id)
    order by q.rank limit 1;
  if v_player is null then
    select p.id into v_player from public.nfl_players p where p.active
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not exists (select 1 from public.fantasy_draft_picks dp where dp.draft_id = v_draft.id and dp.player_id = p.id)
    order by coalesce((
      select max((value)::numeric) from jsonb_each_text(
        case when jsonb_typeof(p.source_payload->'scores') = 'object'
          then p.source_payload->'scores' else '{}'::jsonb end)
      where value ~ '^-?[0-9]+(\.[0-9]+)?$'
    ),0) desc, p.name limit 1;
  end if;

  -- (1) the pool is empty: end the draft cleanly instead of freezing it
  if v_player is null then
    update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
    update public.fantasy_leagues set status='active' where id=p_league_id;
    return null;
  end if;

  update public.fantasy_draft_picks set player_id=v_player,assignment_type='auto',picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,v_player,'draft');
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=v_player;

  select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id=v_draft.id;
  v_next := v_draft.current_overall_pick + 1;
  while v_next <= v_last and exists (select 1 from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=v_next and player_id is not null)
    loop v_next := v_next + 1; end loop;
  if v_next > v_last then
    update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
    update public.fantasy_leagues set status='active' where id=p_league_id;
  else
    update public.fantasy_drafts set current_overall_pick=v_next,
      pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
  end if;
  return v_player;
exception when unique_violation then raise exception 'That player has already been drafted';
end;
$$;

create or replace function public.make_fantasy_draft_pick(p_league_id uuid, p_player_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_player public.nfl_players%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_owner uuid;
  v_next integer;
  v_last integer;
begin
  select * into v_draft from public.fantasy_drafts where league_id=p_league_id for update;
  if not found or v_draft.status<>'live' then raise exception 'The draft is not live'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id=v_draft.id
    and overall_pick=v_draft.current_overall_pick for update;
  -- (2) never overwrite a pick that is already filled
  if v_pick.id is null or v_pick.player_id is not null then raise exception 'That pick is no longer on the clock'; end if;
  select owner_id into v_owner from public.fantasy_teams where id=v_pick.team_id;
  if auth.uid()<>v_owner and not public.is_fantasy_commissioner(p_league_id) then raise exception 'It is not your turn'; end if;
  select * into v_player from public.nfl_players where id=p_player_id and active;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if v_player.id is null then raise exception 'That player is unavailable'; end if;
  if (v_player.position='K' and not v_league.has_kicker) or (v_player.position='DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;
  update public.fantasy_draft_picks set player_id=p_player_id,
    assignment_type=case when auth.uid()=v_owner then 'live' else 'manual' end,picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,p_player_id,case when auth.uid()=v_owner then 'draft' else 'commissioner' end);
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=p_player_id;
  select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id=v_draft.id;
  v_next:=v_draft.current_overall_pick+1;
  while v_next<=v_last and exists (select 1 from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=v_next and player_id is not null)
    loop v_next:=v_next+1; end loop;
  if v_next>v_last then
    update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
    update public.fantasy_leagues set status='active' where id=p_league_id;
  else
    update public.fantasy_drafts set current_overall_pick=v_next,
      pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
  end if;
  return v_pick.overall_pick;
exception when unique_violation then raise exception 'That player has already been drafted';
end;
$$;

create or replace function public.commissioner_assign_fantasy_pick(
  p_league_id uuid, p_overall_pick integer, p_player_id uuid
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_player public.nfl_players%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_next integer;
  v_last integer;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id=p_league_id for update;
  if not found then raise exception 'No draft board exists for this league'; end if;
  if v_draft.status not in ('live','paused') then raise exception 'The draft is not running'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=p_overall_pick for update;
  if v_pick.id is null or v_pick.player_id is not null then raise exception 'That draft slot is unavailable'; end if;
  select * into v_player from public.nfl_players where id=p_player_id and active;
  -- (4) this used to test `found` from the LEAGUE select below it, so an
  -- inactive player sailed through with an all-NULL row.
  if v_player.id is null then raise exception 'Player unavailable'; end if;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if (v_player.position='K' and not v_league.has_kicker) or (v_player.position='DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;
  update public.fantasy_draft_picks set player_id=p_player_id,assignment_type='manual',picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,p_player_id,'commissioner');
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=p_player_id;
  -- (3) advance whenever we filled the pick that is on the clock, paused or not
  if p_overall_pick = v_draft.current_overall_pick then
    select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id=v_draft.id;
    v_next := p_overall_pick + 1;
    while v_next <= v_last and exists (select 1 from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=v_next and player_id is not null)
      loop v_next := v_next + 1; end loop;
    if v_next > v_last then
      update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
      update public.fantasy_leagues set status='active' where id=p_league_id;
    else
      update public.fantasy_drafts set current_overall_pick=v_next,
        pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
    end if;
  end if;
  return p_overall_pick;
exception when unique_violation then raise exception 'That player has already been drafted';
end;
$$;

revoke all on function public.run_expired_fantasy_auto_pick(uuid) from public;
revoke all on function public.commissioner_assign_fantasy_pick(uuid,integer,uuid) from public;
grant execute on function public.run_expired_fantasy_auto_pick(uuid) to authenticated;
grant execute on function public.commissioner_assign_fantasy_pick(uuid,integer,uuid) to authenticated;
grant execute on function public.make_fantasy_draft_pick(uuid,uuid) to authenticated;
