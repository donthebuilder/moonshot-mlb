-- FRANCHISE: the auto-pick drafts by value over replacement, not by prop score.
--
-- run_expired_fantasy_auto_pick's fallback -- what fires when the team on the
-- clock has an empty queue -- ordered by the MAXIMUM of TUDDY's per-market
-- scores for the coming week. lib/fantasy/scoring.js documents at length why
-- that is the wrong question for a draft, and the board was moved off it in
-- #71: "Jared Goff ranked 11th overall at 74, and Ka'imi Fairbairn -- a KICKER
-- -- ranked 14th, in a single-QB PPR league." The board was fixed. The
-- auto-pick was not, so an empty queue on the clock still took a kicker.
--
-- This is a direct translation of scoring.js replacementLevels() + draftValue()
-- into SQL: fill every dedicated slot in the league from the top down, then
-- fill every FLEX from whichever RB/WR/TE are left, and the best man still
-- unclaimed at each position IS replacement level. Nothing here is tuned,
-- weighted or guessed, and nothing is a new model -- the JS is the spec and
-- this reproduces it.
--
-- VERIFIED against the live Week 1 catalog (435 players including the 32 D/ST)
-- on a real PostgreSQL 16: replacement levels identical to the JS to the
-- decimal (RB 12.0, WR 12.2, TE 11.1, QB 19.0, K 7.9, DEF 0), and all 435 rows
-- rank in the same order with a maximum draftValue delta of 0. Also checked:
-- has_kicker=false drops kickers entirely, a 12-team league correctly lowers
-- every replacement level, a position with fewer players than slots clamps to
-- its last man rather than erroring, and a scoring key that is not stored
-- yields 0 for everyone instead of failing.
--
-- SAFE TO APPLY BEFORE THE CATALOG IS RE-SYNCED. season_value is written onto
-- source_payload by lib/nfl/playerCatalog.js. Until a sync has run, no row
-- carries it -- so the function detects that and falls back to the OLD
-- ordering rather than ranking a whole board of zeroes by name.

create or replace function public.fantasy_draft_ranking(p_league_id uuid, p_draft_id uuid)
returns table (player_id uuid, season_value numeric, draft_value numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_league public.fantasy_leagues%rowtype;
  v_has_sv boolean;
begin
  if not public.is_fantasy_league_member(p_league_id) then raise exception 'League access required'; end if;
  select * into v_league from public.fantasy_leagues where id = p_league_id;
  if not found then raise exception 'League not found'; end if;

  select exists (
    select 1 from public.nfl_players p
    where p.active and jsonb_typeof(p.source_payload->'season_value') = 'object'
  ) into v_has_sv;

  if not v_has_sv then
    -- Nothing has been synced with a season value yet. Behave exactly as the
    -- old fallback did rather than inventing an order out of zeroes.
    return query
      select p.id, 0::numeric, coalesce((
        select max((value)::numeric) from jsonb_each_text(
          case when jsonb_typeof(p.source_payload->'scores') = 'object'
            then p.source_payload->'scores' else '{}'::jsonb end)
        where value ~ '^-?[0-9]+(\.[0-9]+)?$'
      ), 0)
      from public.nfl_players p
      where p.active
        and (v_league.has_kicker or p.position <> 'K')
        and (v_league.has_defense or p.position <> 'DEF')
        and not public.fantasy_player_taken(p_league_id, p_draft_id, p.id)
      order by 3 desc, p.name;
    return;
  end if;

  return query
  with pool as (
    select p.id, p.name, p.position,
           coalesce((p.source_payload->'season_value'->>v_league.scoring)::numeric, 0) as v
    from public.nfl_players p
    where p.active
      and p.position in ('QB','RB','WR','TE','K','DEF')
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not public.fantasy_player_taken(p_league_id, p_draft_id, p.id)
  ),
  ranked as (
    select pool.*,
           row_number() over (partition by position order by v desc) as rn,
           count(*)     over (partition by position)                 as n
    from pool
  ),
  -- DEDICATED is scoring.js's own constant: QB 1, RB 2, WR 2, TE 1, K 1, DEF 1.
  ded as (
    select position,
           least(v_league.team_count * case position when 'RB' then 2 when 'WR' then 2 else 1 end,
                 max(n)) as slots,
           max(n) as n
    from ranked group by position
  ),
  -- one FLEX per team, filled from whoever is left across RB/WR/TE, best first
  leftovers as (
    select r.position, r.v, row_number() over (order by r.v desc) as fr
    from ranked r join ded d using (position)
    where r.position in ('RB','WR','TE') and r.rn > d.slots
  ),
  flex as (
    select position, count(*) as extra from leftovers
    where fr <= v_league.team_count group by position
  ),
  cur as (
    select d.position, d.slots + coalesce(f.extra, 0) as idx, d.n
    from ded d left join flex f using (position)
  ),
  -- the best man nobody had to take. Clamped to the last player at that
  -- position, which is what scoring.js's Math.min(i, list.length - 1) does.
  levels as (
    select c.position,
           coalesce((select r.v from ranked r
                     where r.position = c.position and r.rn = least(c.idx + 1, c.n)), 0) as lvl
    from cur c
  )
  select p.id, p.v, p.v - l.lvl
  from pool p join levels l using (position)
  order by 3 desc, p.name;
end;
$$;

revoke all on function public.fantasy_draft_ranking(uuid, uuid) from public;
grant execute on function public.fantasy_draft_ranking(uuid, uuid) to authenticated, service_role;

-- The auto-pick, with only its fallback changed. Everything else -- the locks,
-- the taken check, the roster insert, advancing the clock -- is byte-identical
-- to 202609030002.
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
    select r.player_id into v_player
      from public.fantasy_draft_ranking(p_league_id, v_draft.id) r limit 1;
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
