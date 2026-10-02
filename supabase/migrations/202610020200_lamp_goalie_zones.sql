-- LAMP · WHERE A GOALIE IS SUSCEPTIBLE (2026-10-02, BATCH-3D-V2 1h). Donovan:
-- "we need to see where the goalie is susceptible to shots", his heat map UNDER
-- where the shooter shoots from. lamp_shots stores goalie_id (goalieInNetId) on
-- every shot, so for one goalie: every shot on goal against him and every goal,
-- by WHERE THE SHOT CAME FROM. Not in the data, and not drawn: where in the net a
-- shot went (glove / blocker / five-hole) -- the public feed has no net location.
--
-- Named zones people know, not the 5x5 grid (too few shots per goalie per cell to
-- colour honestly). Same normalising as lib/nhl/shotMap.js (x < 0 -> (-x, -y)):
--   crease      within 8 ft of the net mouth (89, 0), in front of the goal line
--   inner_slot  x >= 69 and |y| <= 9            (between the dots, the house)
--   slot        x >= 54 and |y| <= 22           (the rest of the middle)
--   l_circle    54 <= x <= 89, y > 22           (shooters left)
--   r_circle    54 <= x <= 89, y < -22
--   l_point     x < 54, y >= 0                  (blue line to the top of the circles)
--   r_point     x < 54, y < 0
--   perimeter   everything else (behind the goal line)
-- On goal = result in (sog, goal); a goal = result = goal. Regular season.
--
-- SERVICE ROLE ONLY (like the table): no execute for anon / authenticated.
-- Idempotent: safe to run twice. RUN BEFORE the goalie view ships (it stays
-- hidden until these functions answer).

create index if not exists lamp_shots_goalie_idx on public.lamp_shots (goalie_id, season, game_type);

create or replace function public.lamp_zone_of(nx double precision, ny double precision)
returns text language sql immutable as $$
  select case
    when nx <= 89 and sqrt(power(89 - nx, 2) + power(ny, 2)) <= 8 then 'crease'
    when nx > 89 then 'perimeter'
    when nx >= 69 and abs(ny) <= 9 then 'inner_slot'
    when nx >= 54 and abs(ny) <= 22 then 'slot'
    when nx >= 54 and ny > 22 then 'l_circle'
    when nx >= 54 and ny < -22 then 'r_circle'
    when nx < 54 and ny >= 0 then 'l_point'
    when nx < 54 and ny < 0 then 'r_point'
    else 'perimeter' end
$$;

-- one goalie: shots on goal and goals against, per zone and per shot type in each
create or replace function public.lamp_goalie_zones(p_goalie integer, p_season integer)
returns jsonb language sql stable set search_path = public as $$
  with n as (
    select public.lamp_zone_of(case when x < 0 then -x else x end, case when x < 0 then -y else y end) as zone,
           result, coalesce(shot_type, 'unknown') as shot_type, game_id
    from public.lamp_shots
    where goalie_id = p_goalie and season = p_season and game_type = 2
      and x is not null and y is not null and result in ('sog', 'goal')
  )
  select jsonb_build_object(
    'goalie', p_goalie, 'season', p_season,
    'games', (select count(distinct game_id) from n),
    'sa', (select count(*) from n),
    'ga', (select count(*) from n where result = 'goal'),
    'zones', coalesce((select jsonb_object_agg(zone, z) from (
       select zone, jsonb_build_object('sa', count(*), 'ga', count(*) filter (where result = 'goal'),
         'types', (select jsonb_object_agg(shot_type, jsonb_build_object('sa', c, 'ga', g)) from (
            select shot_type, count(*) as c, count(*) filter (where result = 'goal') as g from n n2 where n2.zone = n.zone group by shot_type) t)) as z
       from n group by zone) q), '{}'::jsonb)
  )
$$;

-- the league, same zones, same season
create or replace function public.lamp_league_zones(p_season integer)
returns jsonb language sql stable set search_path = public as $$
  with n as (
    select public.lamp_zone_of(case when x < 0 then -x else x end, case when x < 0 then -y else y end) as zone, result
    from public.lamp_shots
    where season = p_season and game_type = 2 and x is not null and y is not null and result in ('sog', 'goal')
  )
  select jsonb_build_object('season', p_season, 'sa', (select count(*) from n), 'ga', (select count(*) from n where result = 'goal'),
    'zones', coalesce((select jsonb_object_agg(zone, jsonb_build_object('sa', sa, 'ga', ga)) from (
      select zone, count(*) as sa, count(*) filter (where result = 'goal') as ga from n group by zone) q), '{}'::jsonb))
$$;

revoke all on function public.lamp_goalie_zones(integer, integer) from public, anon, authenticated;
revoke all on function public.lamp_league_zones(integer) from public, anon, authenticated;
grant execute on function public.lamp_goalie_zones(integer, integer) to service_role;
grant execute on function public.lamp_league_zones(integer) to service_role;

-- PROBE (run after; one goalies zone totals must add up to his season totals):
--   with j as (select public.lamp_goalie_zones(8476883, 20252026) as v)
--   select (v->>'sa')::int as sa, (v->>'ga')::int as ga,
--          (select sum((z->>'sa')::int) from jsonb_each(v->'zones') e(k, z)) as zone_sa,
--          (select sum((z->>'ga')::int) from jsonb_each(v->'zones') e(k, z)) as zone_ga
--   from j;            -- 8476883 = Vasilevskiy; expect sa = zone_sa and ga = zone_ga
--   select (public.lamp_league_zones(20252026)->>'sa')::int;   -- the leagues shots on goal, all zones
