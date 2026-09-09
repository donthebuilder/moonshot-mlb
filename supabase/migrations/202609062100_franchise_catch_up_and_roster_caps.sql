-- FRANCHISE — catch up production, and stop auto-pick building an unfillable
-- roster (2026-09-06, before the live draft).
--
-- WHY THIS FILE EXISTS. Production was audited against all 28 migrations by
-- probing PostgREST for the newest object each one creates. Twenty-four had
-- landed. THREE HAD NOT, and they had been silently absent for over a week:
--
--   202608280001_franchise_draft_night_hardening  -- reset_fantasy_draft absent
--   202608290001_franchise_team_identity          -- fantasy_teams.color / .monogram absent
--   202609060001_dash_lineup_state                -- whole table absent
--
-- Confirmed, not inferred: selecting fantasy_teams.color returns 42703
-- "column does not exist", dash_lineup_state returns PGRST205 "could not find
-- the table", and reset_fantasy_draft is granted to `authenticated` in its own
-- migration so it WOULD be exposed by PostgREST if it existed. It is not.
--
-- CRITICAL — WHY THIS IS NOT JUST "RE-RUN THE THREE MIGRATIONS".
-- 202608280001 also replaces run_expired_fantasy_auto_pick,
-- commissioner_assign_fantasy_pick and make_fantasy_draft_pick. Those three
-- were LATER rewritten by 202609030002 (rostered-is-taken) and 202609061200
-- (draft-value auto-pick), both of which ARE applied. Re-running the 08-28
-- file wholesale would roll all three back by nine days and undo both. So the
-- only thing taken from it here is reset_fantasy_draft, the one object nothing
-- later recreated. The 08-28 hardening itself is NOT missing from production --
-- its function bodies were carried forward by the two later migrations, which
-- is why the draft has not been freezing.
--
-- Everything here is idempotent and safe to run twice.

-- ── 1. team identity columns (from 202608290001, verbatim) ──────────────────
alter table public.fantasy_teams
  add column if not exists color text
    check (color is null or color ~* '^#[0-9a-f]{6}$'),
  add column if not exists monogram text
    check (monogram is null or (monogram ~ '^[0-9A-Z]{1,3}$'));

comment on column public.fantasy_teams.color is
  'Owner-picked team color (#rrggbb). Null = deterministic fallback in the UI.';
comment on column public.fantasy_teams.monogram is
  'Owner-picked 1-3 character monogram (A-Z, 0-9). Null = initials fallback.';

-- ── 2. dash_lineup_state (from 202609060001, verbatim) ──────────────────────
create table if not exists public.dash_lineup_state (
  player_id text primary key,
  team_id integer,
  name text,
  last_seen_day text not null,
  updated_at timestamptz not null default now()
);
alter table public.dash_lineup_state enable row level security;

-- ── 3. reset_fantasy_draft (from 202608280001, verbatim, and ONLY this) ─────
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

  delete from public.fantasy_roster_entries
    where league_id = p_league_id and acquired_via in ('draft','commissioner');
  delete from public.fantasy_lineup_slots
    where team_id in (select id from public.fantasy_teams where league_id = p_league_id);

  update public.fantasy_leagues set status = 'setup' where id = p_league_id;
  return v_cleared;
end;
$$;
revoke all on function public.reset_fantasy_draft(uuid,text) from public;
grant execute on function public.reset_fantasy_draft(uuid,text) to authenticated;

-- ── 4. propose_fantasy_trade (from 202609061800) ────────────────────────────
-- Committed in b5a0681 but never applied, which is why no trade has ever
-- completed. The array was unnested as `id`, and Postgres resolves an
-- unqualified name in the INNERMOST scope first -- where fantasy_roster_entries
-- has its own `id` column -- so `r.player_id = id` silently meant
-- `r.player_id = r.id` and the not-exists was always true.
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

-- ── 5. NEW — auto-pick can no longer build an unfillable roster ─────────────
-- The 2026-08-28 draft-night audit left this open: "Roster composition is not
-- enforced anywhere in the draft SQL -- no roster cap, no per-position maximum.
-- A team that times out repeatedly can end up with 13 wide receivers and an
-- unfillable lineup."
--
-- Position caps alone DO NOT fix that, and it is worth saying why, because it
-- was the first thing tried and it failed its own test: with a WR cap of 8 and
-- an 8-round draft, a fully-absent owner still ended up with eight receivers
-- and nothing else -- a roster that cannot field a single legal lineup. A cap
-- limits the damage; it does not guarantee the thing that actually matters.
--
-- What guarantees it is RESERVING the picks a team still needs. The rule:
--
--   if (picks this team has left) <= (starting slots it still has not filled)
--   then it may only draft a position it still needs.
--
-- Before that point it drafts the best player available, so early rounds are
-- untouched and nobody is forced to take a kicker in round 3. From that point
-- on, every remaining pick is spent on a hole. A team that never once shows up
-- ends the draft with a legal starting lineup, and a team that drafts normally
-- never notices this code exists.
--
-- Requirements are scoring.js's own DEDICATED constant -- QB 1, RB 2, WR 2,
-- TE 1, K 1, DEF 1 -- so the draft and the lineup screen cannot disagree about
-- what a full starting lineup is. K and DEF drop out when the league is not
-- using them.
create or replace function public.fantasy_required_starters(p_league_id uuid)
-- `pos`, not `position`: POSITION is a reserved word in a RETURNS TABLE
-- signature and Postgres rejects the function outright.
returns table (pos text, required integer) language sql stable as $$
  select v.pos, v.required
  from (values ('QB',1),('RB',2),('WR',2),('TE',1),('K',1),('DEF',1)) v(pos,required)
  where (v.pos <> 'K'   or coalesce((select l.has_kicker  from public.fantasy_leagues l where l.id = p_league_id), true))
    and (v.pos <> 'DEF' or coalesce((select l.has_defense from public.fantasy_leagues l where l.id = p_league_id), true));
$$;

-- A loose ceiling, kept as a second line of defence for the rounds BEFORE the
-- reservation rule bites. Not a strategy opinion -- only enough to stop one
-- position eating a roster while slots are still open.
create or replace function public.fantasy_position_cap(p_position text)
returns integer language sql immutable as $$
  select case upper(coalesce(p_position,''))
    when 'QB' then 3 when 'TE' then 3 when 'K' then 2 when 'DEF' then 2
    when 'RB' then 8 when 'WR' then 8 else 99 end;
$$;

create or replace function public.run_expired_fantasy_auto_pick(p_league_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_player uuid;
  v_next integer;
  v_last integer;
  v_remaining integer;
  v_unmet integer;
begin
  if not public.is_fantasy_league_member(p_league_id) then raise exception 'League access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found or v_draft.status <> 'live' then raise exception 'The draft is not live'; end if;
  if v_draft.pick_deadline is null or v_draft.pick_deadline > now() then raise exception 'The pick timer has not expired'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id = v_draft.id
    and overall_pick = v_draft.current_overall_pick for update;
  if v_pick.id is null or v_pick.player_id is not null then raise exception 'That pick is no longer on the clock'; end if;
  select * into v_league from public.fantasy_leagues where id = p_league_id;

  -- An owner's own queue is an explicit instruction and is honoured as-is.
  -- The reservation rule applies only where the machine is choosing for him.
  select q.player_id into v_player from public.fantasy_draft_queue q
    join public.nfl_players p on p.id = q.player_id and p.active
    where q.draft_id = v_draft.id and q.team_id = v_pick.team_id
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not public.fantasy_player_taken(p_league_id, v_draft.id, p.id)
    order by q.rank limit 1;

  if v_player is null then
    -- picks this team still has, including the one on the clock
    select count(*) into v_remaining from public.fantasy_draft_picks
      where draft_id = v_draft.id and team_id = v_pick.team_id and player_id is null;
    -- starting slots it still has not filled
    select coalesce(sum(greatest(0, rs.required - coalesce(h.n, 0))), 0) into v_unmet
      from public.fantasy_required_starters(p_league_id) rs
      left join (
        select ep.position as pos, count(*) as n
          from public.fantasy_roster_entries e
          join public.nfl_players ep on ep.id = e.player_id
         where e.team_id = v_pick.team_id and e.released_at is null
         group by ep.position
      ) h on h.pos = rs.pos;

    -- WITH ORDINALITY preserves fantasy_draft_ranking's own "order by 3 desc,
    -- name". Joining a set-returning function without it does not guarantee the
    -- function's ordering survives, and a silently-reordered board would
    -- auto-pick the wrong man with nothing on screen to show it.
    if v_remaining <= v_unmet then
      select r.player_id into v_player
        from public.fantasy_draft_ranking(p_league_id, v_draft.id)
               with ordinality as r(player_id, season_value, draft_value, ord)
        join public.nfl_players np on np.id = r.player_id
        join public.fantasy_required_starters(p_league_id) rs on rs.pos = np.position
        left join (
          select ep.position as pos, count(*) as n
            from public.fantasy_roster_entries e
            join public.nfl_players ep on ep.id = e.player_id
           where e.team_id = v_pick.team_id and e.released_at is null
           group by ep.position
        ) h on h.pos = rs.pos
       where coalesce(h.n, 0) < rs.required
       order by r.ord limit 1;
    end if;

    if v_player is null then
      select r.player_id into v_player
        from public.fantasy_draft_ranking(p_league_id, v_draft.id)
               with ordinality as r(player_id, season_value, draft_value, ord)
        join public.nfl_players np on np.id = r.player_id
       where (select count(*) from public.fantasy_roster_entries e
                join public.nfl_players ep on ep.id = e.player_id
               where e.team_id = v_pick.team_id and e.released_at is null
                 and ep.position = np.position)
             < public.fantasy_position_cap(np.position)
       order by r.ord limit 1;
    end if;

    -- Neither rule may ever freeze a draft. If nothing satisfies them, take the
    -- best available anyway -- an ugly roster beats the hang this function was
    -- hardened against on 2026-08-28.
    if v_player is null then
      select r.player_id into v_player
        from public.fantasy_draft_ranking(p_league_id, v_draft.id)
               with ordinality as r(player_id, season_value, draft_value, ord)
       order by r.ord limit 1;
    end if;
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
revoke all on function public.run_expired_fantasy_auto_pick(uuid) from public;
grant execute on function public.run_expired_fantasy_auto_pick(uuid) to authenticated;
