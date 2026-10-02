-- LAMP · THE LEAGUE'S SHOT MAP (2026-10-01, 2D TOP TIER 2 "vs a typical
-- player"). One season's every regular-season attempt, aggregated IN the
-- database, so the shot map can say "his slot share vs the league's" and
-- "his zone grid vs the league's" without shipping ~100k rows to a server
-- function once a day. Returns a few hundred bytes. No new table, no stored
-- data: a read-only function over public.lamp_shots.
--
-- The SAME rules as lib/nhl/shotMap.js summarise(), so a player's numbers and
-- the league's are cut the same way:
--   normalise   x < 0 -> (-x, -y)            (every shot attacks the right-hand net)
--   grid        x0 25 .. x1 100, 5 cols (15 ft); y 42.5 .. -42.5, 5 rows (17 ft),
--               row 0 at the top (y = 42.5); shots with x < 25 are not in the grid
--   on net      result in ('sog', 'goal')
--   slot        69 <= x <= 89 and |y| <= 22, among shots on net
--
-- SERVICE ROLE ONLY (like the table): no execute for anon / authenticated.
-- Idempotent: safe to run twice.

create or replace function public.lamp_league_shot_grid(p_season integer)
returns jsonb
language sql
stable
set search_path = public
as $$
  with n as (
    select case when x < 0 then -x else x end as nx,
           case when x < 0 then -y else y end as ny,
           result,
           game_id
    from public.lamp_shots
    where season = p_season and game_type = 2 and x is not null and y is not null
  ),
  cells as (
    select least(4, greatest(0, floor((42.5 - ny) / 17.0)))::int as r,
           least(4, floor((nx - 25) / 15.0))::int as c,
           count(*) as att,
           count(*) filter (where result in ('sog', 'goal')) as sog,
           count(*) filter (where result = 'goal') as g
    from n
    where nx >= 25
    group by 1, 2
  )
  select jsonb_build_object(
    'season', p_season,
    'games', (select count(distinct game_id) from n),
    'attempts', (select count(*) from n),
    'sog', (select count(*) from n where result in ('sog', 'goal')),
    'slotSog', (select count(*) from n where result in ('sog', 'goal') and nx between 69 and 89 and abs(ny) <= 22),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('r', r, 'c', c, 'att', att, 'sog', sog, 'g', g) order by r, c) from cells), '[]'::jsonb)
  )
$$;

revoke all on function public.lamp_league_shot_grid(integer) from public, anon, authenticated;
grant execute on function public.lamp_league_shot_grid(integer) to service_role;

-- Probe (run after; expect one row: games = the season's graded games in
-- lamp_shots, at most 1312 for a full 2025-26; 25 cells or fewer):
--   select (j->>'games')::int as games, (j->>'attempts')::int as attempts,
--          round((j->>'slotSog')::numeric / nullif((j->>'sog')::numeric, 0), 3) as slot_share,
--          jsonb_array_length(j->'cells') as cells
--   from (select public.lamp_league_shot_grid(20252026) as j) q;
