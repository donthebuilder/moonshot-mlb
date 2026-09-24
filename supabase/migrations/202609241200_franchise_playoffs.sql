-- ═══════════════════════════════════════════════════════════════════════════
-- FRANCHISE PLAYOFFS (2026-09-24)
--
-- Donovan: "do the best thing for the league." The season used to simply stop
-- after Week 14: no seeds, no bracket, no champion.
--
-- THE FORMAT, and why:
--   · Regular season: Weeks 1-14, unchanged.
--   · FOUR teams make it. DASH Fantasy Franchise has nine; four is under half,
--     so the regular season still means something, and it is the format most
--     8-10 team leagues use.
--   · Week 15: semifinals, 1 v 4 and 2 v 3, higher seed at home.
--   · Week 16: championship (semifinal winners) and a 3rd-place game (losers).
--   · Done by Week 16 on purpose: NFL Week 17 is when contenders rest starters,
--     and a title should not be decided by who got benched.
--   · Seeds: win percentage (ties count half), then wins, then points for --
--     exactly the order the Standings page already ranks by.
--   · A tied playoff game goes to the higher seed.
--
-- Stored per league (playoff_teams, playoff_start_week) so another league can
-- run 2 or 0; nothing else in the app assumes four.
--
-- It runs itself: the scoring cron calls advance_all_fantasy_playoffs() after
-- every refresh. It is idempotent -- it does nothing until the regular season
-- is final, seeds the semifinals once, and writes the Week 16 games once the
-- semifinals are final.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.fantasy_leagues
  add column if not exists playoff_teams smallint not null default 4,
  add column if not exists playoff_start_week smallint not null default 15;
do $$ begin
  alter table public.fantasy_leagues add constraint fantasy_leagues_playoff_teams_check check (playoff_teams in (0, 2, 4));
exception when duplicate_object then null; end $$;

alter table public.fantasy_matchups
  add column if not exists round text not null default 'regular',
  add column if not exists home_seed smallint,
  add column if not exists away_seed smallint;
do $$ begin
  alter table public.fantasy_matchups add constraint fantasy_matchups_round_check check (round in ('regular', 'semifinal', 'final', 'third_place'));
exception when duplicate_object then null; end $$;


-- Regular-season standings, in seed order. Only rows the scoring refresh has
-- marked final count, and only weeks before the playoffs.
create or replace function public.fantasy_regular_standings(p_league_id uuid, p_season smallint)
returns table(team_id uuid, wins integer, losses integer, ties integer, points_for numeric, seed integer)
language sql stable security definer set search_path = public as $$
  with lg as (select playoff_start_week from public.fantasy_leagues where id = p_league_id),
  games as (
    select m.home_team_id as team, m.home_score as pf, m.away_score as pa from public.fantasy_matchups m, lg
      where m.league_id = p_league_id and m.season = p_season and m.round = 'regular' and m.status = 'final' and m.week < lg.playoff_start_week
    union all
    select m.away_team_id, m.away_score, m.home_score from public.fantasy_matchups m, lg
      where m.league_id = p_league_id and m.season = p_season and m.round = 'regular' and m.status = 'final' and m.week < lg.playoff_start_week
  ),
  rec as (
    select t.id as team_id,
      count(*) filter (where g.pf > g.pa)::int as wins,
      count(*) filter (where g.pf < g.pa)::int as losses,
      count(*) filter (where g.pf = g.pa and g.team is not null)::int as ties,
      coalesce(sum(g.pf), 0) as points_for
    from public.fantasy_teams t left join games g on g.team = t.id
    where t.league_id = p_league_id group by t.id, t.created_at
  )
  select r.team_id, r.wins, r.losses, r.ties, r.points_for,
    row_number() over (order by
      case when r.wins + r.losses + r.ties > 0 then (r.wins + r.ties * 0.5) / (r.wins + r.losses + r.ties) else 0 end desc,
      r.wins desc, r.points_for desc, r.team_id)::int as seed
  from rec r;
$$;
revoke all on function public.fantasy_regular_standings(uuid, smallint) from public;
grant execute on function public.fantasy_regular_standings(uuid, smallint) to authenticated, service_role;


create or replace function public.advance_fantasy_playoffs_unchecked(p_league_id uuid, p_season smallint)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_league public.fantasy_leagues%rowtype;
  v_start smallint;
  v_pending integer;
  v_seed uuid[];
  v_semis public.fantasy_matchups[];
  v_s public.fantasy_matchups;
  v_winners uuid[] := '{}';
  v_winner_seeds smallint[] := '{}';
  v_losers uuid[] := '{}';
  v_loser_seeds smallint[] := '{}';
  v_home_wins boolean;
begin
  select * into v_league from public.fantasy_leagues where id = p_league_id;
  if v_league.id is null or v_league.status <> 'active' or v_league.playoff_teams = 0 then return 'off'; end if;
  v_start := v_league.playoff_start_week;

  -- 1 · Seed, once the regular season is complete.
  if not exists (select 1 from public.fantasy_matchups where league_id = p_league_id and season = p_season and round <> 'regular') then
    select count(*) into v_pending from public.fantasy_matchups
      where league_id = p_league_id and season = p_season and round = 'regular' and week < v_start and status <> 'final';
    if v_pending > 0 or not exists (select 1 from public.fantasy_matchups where league_id = p_league_id and season = p_season and round = 'regular' and week = v_start - 1)
      then return 'regular season in progress'; end if;
    select array_agg(team_id order by seed) into v_seed from public.fantasy_regular_standings(p_league_id, p_season) where seed <= v_league.playoff_teams;
    if coalesce(array_length(v_seed, 1), 0) < v_league.playoff_teams then return 'not enough teams'; end if;
    if v_league.playoff_teams = 2 then
      insert into public.fantasy_matchups(league_id, season, week, home_team_id, away_team_id, round, home_seed, away_seed)
        values (p_league_id, p_season, v_start, v_seed[1], v_seed[2], 'final', 1, 2);
      return 'seeded final';
    end if;
    insert into public.fantasy_matchups(league_id, season, week, home_team_id, away_team_id, round, home_seed, away_seed) values
      (p_league_id, p_season, v_start, v_seed[1], v_seed[4], 'semifinal', 1, 4),
      (p_league_id, p_season, v_start, v_seed[2], v_seed[3], 'semifinal', 2, 3);
    return 'seeded semifinals';
  end if;

  -- 2 · Semifinals final -> championship and 3rd place, once.
  if v_league.playoff_teams = 4
     and not exists (select 1 from public.fantasy_matchups where league_id = p_league_id and season = p_season and round in ('final', 'third_place')) then
    select array_agg(m order by m.home_seed) into v_semis from public.fantasy_matchups m
      where m.league_id = p_league_id and m.season = p_season and m.round = 'semifinal';
    if coalesce(array_length(v_semis, 1), 0) <> 2 then return 'semifinals missing'; end if;
    foreach v_s in array v_semis loop
      if v_s.status <> 'final' then return 'semifinals in progress'; end if;
      -- A tie goes to the higher seed, which is always the home team here.
      v_home_wins := v_s.home_score >= v_s.away_score;
      v_winners := v_winners || case when v_home_wins then v_s.home_team_id else v_s.away_team_id end;
      v_winner_seeds := v_winner_seeds || case when v_home_wins then v_s.home_seed else v_s.away_seed end;
      v_losers := v_losers || case when v_home_wins then v_s.away_team_id else v_s.home_team_id end;
      v_loser_seeds := v_loser_seeds || case when v_home_wins then v_s.away_seed else v_s.home_seed end;
    end loop;
    insert into public.fantasy_matchups(league_id, season, week, home_team_id, away_team_id, round, home_seed, away_seed) values
      (p_league_id, p_season, v_start + 1,
        case when v_winner_seeds[1] < v_winner_seeds[2] then v_winners[1] else v_winners[2] end,
        case when v_winner_seeds[1] < v_winner_seeds[2] then v_winners[2] else v_winners[1] end,
        'final', least(v_winner_seeds[1], v_winner_seeds[2]), greatest(v_winner_seeds[1], v_winner_seeds[2])),
      (p_league_id, p_season, v_start + 1,
        case when v_loser_seeds[1] < v_loser_seeds[2] then v_losers[1] else v_losers[2] end,
        case when v_loser_seeds[1] < v_loser_seeds[2] then v_losers[2] else v_losers[1] end,
        'third_place', least(v_loser_seeds[1], v_loser_seeds[2]), greatest(v_loser_seeds[1], v_loser_seeds[2]));
    return 'seeded championship';
  end if;
  return 'bracket set';
end;
$$;
revoke all on function public.advance_fantasy_playoffs_unchecked(uuid, smallint) from public;
revoke execute on function public.advance_fantasy_playoffs_unchecked(uuid, smallint) from authenticated, anon;

-- Service-only: the scoring cron runs this after every refresh.
create or replace function public.advance_all_fantasy_playoffs(p_season smallint)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_changed integer := 0; v_result text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Scoring service access required'; end if;
  for v_id in select id from public.fantasy_leagues where status = 'active' and playoff_teams > 0 loop
    v_result := public.advance_fantasy_playoffs_unchecked(v_id, p_season);
    if v_result like 'seeded%' then v_changed := v_changed + 1; end if;
  end loop;
  return v_changed;
end;
$$;
revoke all on function public.advance_all_fantasy_playoffs(smallint) from public;
grant execute on function public.advance_all_fantasy_playoffs(smallint) to service_role;
