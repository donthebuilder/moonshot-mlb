-- ── A SCHEDULE THAT FIXES ITSELF (2026-09-01) ───────────────────────────────
--
-- Donovan: "add an option if we don't fill up all the teams it will fix
-- itself scheduling."
--
-- THE TRAP THIS REMOVES. generate_fantasy_schedule refused outright if a
-- schedule already existed -- 'This season already has a schedule'. It is a
-- manual button on the matchup page, and it builds from whoever is in
-- fantasy_teams AT THAT MOMENT. So a commissioner who pressed it with eight
-- of fourteen teams in got a permanent eight-team schedule: the six who
-- joined afterwards had no matchup in any week, forever, and no way to fix it
-- short of deleting rows by hand. They would not appear on the matchup page,
-- their scores would never be refreshed, and the "your lineup is empty" alert
-- would never fire for them, because that producer only looks at teams which
-- actually have a matchup that week.
--
-- Two changes, and neither of them can rewrite a week that has been played.
--
--   1. REGENERATION IS ALLOWED WHILE NOTHING HAS BEEN PLAYED. If every
--      matchup for the season is still 'scheduled' and no lineup slot has
--      locked, the old rows are deleted and the schedule is rebuilt from the
--      current team list. The moment a game goes live or a lineup locks, the
--      old refusal comes back -- you cannot rewrite history, and the error
--      says which of the two stopped it.
--
--   2. STARTING THE DRAFT REBUILDS IT. That is the moment a league is final
--      by definition: everybody who is coming has come. It happens inside an
--      exception block, so a schedule problem can NEVER block a draft from
--      starting -- the draft is the thing with fourteen people waiting on it.
--
-- ON AN ODD NUMBER OF TEAMS. The rotation already appends a null slot, which
-- is the standard round-robin bye, and it rotates: with seven teams, one team
-- sits out each week and every team sits exactly once per seven-week cycle.
-- That is fair. It is not a reason to refuse to schedule.

create or replace function public.generate_fantasy_schedule(
  p_league_id uuid,
  p_season smallint default 2026,
  p_weeks smallint default 14
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_team_ids uuid[];
  v_rotated uuid[];
  v_next uuid[];
  v_team_count integer;
  v_slots integer;
  v_round integer;
  v_week integer;
  v_pair integer;
  v_home uuid;
  v_away uuid;
  v_created integer := 0;
begin
  if not public.is_fantasy_commissioner(p_league_id)
    then raise exception 'Commissioner access required'; end if;
  if p_season not between 2025 and 2100 or p_weeks not between 1 and 18
    then raise exception 'Invalid schedule season or length'; end if;

  -- REBUILD, BUT NEVER OVER SOMETHING THAT HAS HAPPENED. Two independent
  -- tests, because they fail at different moments: a matchup leaves
  -- 'scheduled' when the feed says its games are live, and a lineup slot
  -- locks at that player's own kickoff. Either one means a real week is
  -- underway and the schedule is now history rather than a plan.
  if exists (select 1 from public.fantasy_matchups
             where league_id=p_league_id and season=p_season and status <> 'scheduled')
    then raise exception 'A week has already been played -- the schedule cannot be rebuilt now'; end if;
  if exists (select 1 from public.fantasy_lineup_slots l
             join public.fantasy_teams t on t.id=l.team_id
             where t.league_id=p_league_id and l.season=p_season and l.locked_at is not null)
    then raise exception 'Lineups have started locking -- the schedule cannot be rebuilt now'; end if;

  delete from public.fantasy_matchups where league_id=p_league_id and season=p_season;

  select array_agg(id order by coalesce(draft_position, 32767), created_at, id)
    into v_team_ids from public.fantasy_teams where league_id=p_league_id;
  v_team_count := coalesce(array_length(v_team_ids,1),0);
  if v_team_count < 2 then raise exception 'At least two teams are required'; end if;

  v_rotated := v_team_ids;
  if mod(v_team_count,2)=1 then v_rotated := array_append(v_rotated,null::uuid); end if;
  v_slots := array_length(v_rotated,1);

  for v_week in 1..p_weeks loop
    v_round := mod(v_week-1,v_slots-1);
    if v_round=0 and v_week>1 then v_rotated := v_team_ids;
      if mod(v_team_count,2)=1 then v_rotated := array_append(v_rotated,null::uuid); end if;
    end if;
    for v_pair in 1..(v_slots/2) loop
      v_home := v_rotated[v_pair];
      v_away := v_rotated[v_slots-v_pair+1];
      if v_home is not null and v_away is not null then
        if mod(v_week+v_pair,2)=0 then
          insert into public.fantasy_matchups(league_id,season,week,home_team_id,away_team_id)
            values(p_league_id,p_season,v_week,v_home,v_away);
        else
          insert into public.fantasy_matchups(league_id,season,week,home_team_id,away_team_id)
            values(p_league_id,p_season,v_week,v_away,v_home);
        end if;
        v_created := v_created+1;
      end if;
    end loop;
    v_next := array[v_rotated[1],v_rotated[v_slots]]::uuid[];
    if v_slots>2 then v_next := v_next || v_rotated[2:v_slots-1]; end if;
    v_rotated := v_next;
  end loop;
  return v_created;
end;
$$;

-- ── STARTING THE DRAFT IS WHEN THE LEAGUE IS FINAL ──────────────────────────
create or replace function public.start_fantasy_draft(p_league_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_draft public.fantasy_drafts%rowtype;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id=p_league_id for update;
  if not found then raise exception 'Prepare the draft order first'; end if;
  if v_draft.status<>'setup' then raise exception 'The draft has already started'; end if;
  if not exists(select 1 from public.fantasy_draft_picks where draft_id=v_draft.id) then raise exception 'The draft board is empty'; end if;

  -- THE SELF-HEALING BIT. Whoever is here now is the league, so the schedule
  -- is rebuilt from the current team list rather than from whatever the count
  -- was when somebody last pressed the button.
  --
  -- INSIDE AN EXCEPTION BLOCK, DELIBERATELY. A draft has a room full of
  -- people waiting on it and a schedule does not; a schedule problem must
  -- never be the reason a draft will not start. If this cannot run -- a week
  -- already played, a lock already taken -- the draft proceeds and the
  -- commissioner still has the button on the matchup page.
  begin
    perform public.generate_fantasy_schedule(p_league_id, 2026::smallint, 14::smallint);
  exception when others then
    null;
  end;

  update public.fantasy_drafts set status='live',current_overall_pick=1,started_at=now(),
    pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
  update public.fantasy_leagues set status='drafting' where id=p_league_id;
  return v_draft.id;
end;
$$;

revoke all on function public.generate_fantasy_schedule(uuid,smallint,smallint) from public;
grant execute on function public.generate_fantasy_schedule(uuid,smallint,smallint) to authenticated;
revoke all on function public.start_fantasy_draft(uuid) from public;
grant execute on function public.start_fantasy_draft(uuid) to authenticated;
