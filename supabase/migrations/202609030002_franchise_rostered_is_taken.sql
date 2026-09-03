-- ─────────────────────────────────────────────────────────────────────────────
-- #91, THE HALF THAT WAS LEFT — AND IT IS NOT COSMETIC, IT CAN HANG A DRAFT
-- 2026-09-03
--
-- The site half shipped earlier: the draft board now hides a player who is on
-- a roster, not just one who has a pick. This is the database saying the same
-- thing, and while writing it the finding turned out to be worse than the log
-- described.
--
-- WHAT WAS ACTUALLY BROKEN. Every availability test in the draft functions asks
-- ONE question: does this player have a row in fantasy_draft_picks. But a pick
-- is only one of the ways a man gets rostered. A free-agent add off the Wire, a
-- commissioner assignment, or a partial reset that nulls player_id on the picks
-- while leaving fantasy_roster_entries intact all leave somebody rostered with
-- no pick — and therefore, to these functions, available.
--
-- fantasy_roster_entries already carries
--     unique nulls not distinct (league_id, player_id, released_at)
-- so the DATA was never at risk: the second insert raises unique_violation and
-- every one of these functions catches it and says "That player has already
-- been drafted." Correct, and fine when a human clicked the button — they see
-- the message and pick somebody else.
--
-- IT IS NOT FINE WHEN THE AUTO-PICKER CHOOSES HIM. run_expired_fantasy_auto_pick
-- selects the best available man, fills the pick, then inserts the roster row.
-- If that man is already rostered the insert throws, the whole transaction rolls
-- back, and the clock does not advance. The next tick runs the same query, gets
-- the same player, and throws again. THE DRAFT HANGS, permanently, and nothing
-- in the UI says why — the pick simply sits there reading "auto-picking…".
--
-- That is the same symptom as #88, arriving through a different door, and it
-- matters more now than it did last week: the server draft clock (added today)
-- runs this function EVERY MINUTE. A poisoned pick would retry fourteen hundred
-- times a day, forever, instead of once whenever somebody happened to have a
-- tab open.
--
-- THE FIX is to ask the question the roster table can answer, everywhere the
-- old question was asked. One helper, four call sites, no behaviour change for
-- any player who is genuinely free.
--
-- NO DATA IS TOUCHED. No unique index is added — the right one already exists.
-- No rows are updated or deleted. This migration only replaces function bodies,
-- so re-running it is safe and rolling back means restoring the previous
-- definitions from 202608280001 and 202608250005.
-- ─────────────────────────────────────────────────────────────────────────────

-- Every way a player can be off the board, in one place, so the four callers
-- cannot drift apart again — which is exactly how this bug survived: the wire
-- has always filtered on roster entries and the draft asked a different table.
create or replace function public.fantasy_player_taken(
  p_league_id uuid, p_draft_id uuid, p_player_id uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fantasy_draft_picks dp
     where dp.draft_id = p_draft_id and dp.player_id = p_player_id
  ) or exists (
    select 1 from public.fantasy_roster_entries re
     where re.league_id = p_league_id and re.player_id = p_player_id
       and re.released_at is null
  );
$$;

revoke all on function public.fantasy_player_taken(uuid,uuid,uuid) from public;
grant execute on function public.fantasy_player_taken(uuid,uuid,uuid) to authenticated;


-- ── 1 of 4 · the queue ──────────────────────────────────────────────────────
-- Queueing a rostered player is harmless on its own but it is how he reaches
-- the auto-picker, which is where it stops being harmless.
create or replace function public.add_fantasy_draft_queue(p_league_id uuid, p_player_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft uuid;
  v_team uuid;
  v_rank integer;
begin
  select id into v_draft from public.fantasy_drafts where league_id = p_league_id;
  select id into v_team from public.fantasy_teams where league_id = p_league_id and owner_id = auth.uid();
  if v_draft is null or v_team is null then raise exception 'Draft and team are required'; end if;
  if public.fantasy_player_taken(p_league_id, v_draft, p_player_id)
    then raise exception 'That player is already on a roster'; end if;
  select coalesce(max(rank),0)+1 into v_rank from public.fantasy_draft_queue where draft_id = v_draft and team_id = v_team;
  insert into public.fantasy_draft_queue (draft_id,team_id,player_id,rank)
    values (v_draft,v_team,p_player_id,v_rank) on conflict (draft_id,team_id,player_id) do nothing;
  return v_rank;
end;
$$;


-- ── 2 of 4 · the auto-picker · THE ONE THAT HANGS ───────────────────────────
-- Both selects gain the roster test: the queue lookup and the best-available
-- fallback. Identical to 202608280001 in every other respect, deliberately —
-- the empty-pool close-out and the skip-ahead loop are unchanged.
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
  if v_pick.id is null or v_pick.player_id is not null then raise exception 'That pick is no longer on the clock'; end if;
  select * into v_league from public.fantasy_leagues where id = p_league_id;

  select q.player_id into v_player from public.fantasy_draft_queue q
    join public.nfl_players p on p.id = q.player_id and p.active
    where q.draft_id = v_draft.id and q.team_id = v_pick.team_id
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not public.fantasy_player_taken(p_league_id, v_draft.id, p.id)
    order by q.rank limit 1;
  if v_player is null then
    select p.id into v_player from public.nfl_players p where p.active
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not public.fantasy_player_taken(p_league_id, v_draft.id, p.id)
    order by coalesce((
      select max((value)::numeric) from jsonb_each_text(
        case when jsonb_typeof(p.source_payload->'scores') = 'object'
          then p.source_payload->'scores' else '{}'::jsonb end)
      where value ~ '^-?[0-9]+(\.[0-9]+)?$'
    ),0) desc, p.name limit 1;
  end if;

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


-- ── 3 of 4 · a manager taking a name ────────────────────────────────────────
-- The message changes as well as the test. "Already been drafted" is confusing
-- when the man was never drafted — he was added off the wire.
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
  if v_pick.id is null or v_pick.player_id is not null then raise exception 'That pick is no longer on the clock'; end if;
  select owner_id into v_owner from public.fantasy_teams where id=v_pick.team_id;
  if auth.uid()<>v_owner and not public.is_fantasy_commissioner(p_league_id) then raise exception 'It is not your turn'; end if;
  select * into v_player from public.nfl_players where id=p_player_id and active;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if v_player.id is null then raise exception 'That player is unavailable'; end if;
  if (v_player.position='K' and not v_league.has_kicker) or (v_player.position='DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;
  if public.fantasy_player_taken(p_league_id, v_draft.id, p_player_id)
    then raise exception 'That player is already on a roster'; end if;
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
exception when unique_violation then raise exception 'That player is already on a roster';
end;
$$;


-- ── 4 of 4 · the commissioner placing a name into any open pick ─────────────
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
  if v_player.id is null then raise exception 'Player unavailable'; end if;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if (v_player.position='K' and not v_league.has_kicker) or (v_player.position='DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;
  if public.fantasy_player_taken(p_league_id, v_draft.id, p_player_id)
    then raise exception 'That player is already on a roster'; end if;
  update public.fantasy_draft_picks set player_id=p_player_id,assignment_type='manual',picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,p_player_id,'commissioner');
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=p_player_id;
  if p_overall_pick = v_draft.current_overall_pick then
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
  end if;
  return p_overall_pick;
exception when unique_violation then raise exception 'That player is already on a roster';
end;
$$;
