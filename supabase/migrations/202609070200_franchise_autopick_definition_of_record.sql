-- FRANCHISE: one definition of record for the auto-pick.
--
-- Two migrations written the same day both redefine
-- run_expired_fantasy_auto_pick, and they were written by two sessions that
-- did not know about each other:
--
--   202609061200  added fantasy_draft_ranking (value over replacement) and
--                 pointed the auto-pick's empty-queue fallback at it.
--   202609062100  added the roster-cap logic that stops the auto-pick building
--                 a roster it cannot fill -- and, correctly, calls
--                 fantasy_draft_ranking from three places.
--
-- 062100 is the union of both and is the one to keep. But `create or replace`
-- has no opinion about who came first: run in filename order the right one
-- wins, and run in the order a person actually pastes them -- 062100 was
-- already applied, then 061200 handed over afterwards -- the older definition
-- lands last and the roster caps silently disappear. Verified on a replica
-- built from all 31 migrations: applying 061200 after 062100 leaves an
-- auto-pick that calls the ranking function but has lost `with ordinality`
-- entirely, with no error anywhere.
--
-- This re-asserts 062100's body verbatim, so the last migration to touch the
-- function is the one that should own it, whatever order anything else ran in.
-- Safe to run more than once, and safe to run at any point after 062100.

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
