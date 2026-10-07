-- LAMP · THE LEAGUE'S SHOT MAP, MIRRORED-SHOT FIX (2026-10-07). NOT RUN: Donovan runs it.
--
-- The 2026-10-01 function (202610010100_lamp_league_shot_grid.sql) turned every shot with x < 0 onto the
-- right-hand net. A shot ON GOAL taken from the shooter's OWN end (lamp_shots.zone = 'D': a pulled goalie,
-- a penalty-kill clear) sits behind him, so it was mirrored onto the NEAR net: about 2,300 phantom close
-- shots in 2025-26 in the league grid and slot share. lib/nhl/shotNorm.js (the JS side, which the player
-- and club maps use) already reads the zone; this makes the league's numbers the SAME rule, so "his slot
-- share vs the league's" compares like with like.
--
-- THE RULE, same as lib/nhl/xgFeatures.js normShot():
--   away   = zone = 'D' and result is not 'block'   (a blocked shot's coordinates are already toward its net)
--   facing = away ? (x > 0 ? -1 : 1) : (x < 0 ? -1 : 1)
--   nx, ny = facing * x, facing * y
-- Everything else is unchanged: grid x 25..100 in 5 cols, y in 5 rows, shots with nx < 25 are not in the
-- grid (an own-end shot lands at nx < 0 now), slot = 69 <= nx <= 89 and |ny| <= 22 among shots on net.
-- xG is untouched: it never read this function.
--
-- SERVICE ROLE ONLY. Idempotent (create or replace): safe to run twice. Nothing depends on it: the JS fix works
-- without it, and until this runs the league comparison keeps the old numbers.

create or replace function public.lamp_league_shot_grid(p_season integer)
returns jsonb
language sql
stable
set search_path = public
as $$
  with n as (
    select f.facing * x as nx,
           f.facing * y as ny,
           result,
           game_id
    from public.lamp_shots s
    cross join lateral (
      select case
        when s.zone = 'D' and s.result is distinct from 'block' then (case when s.x > 0 then -1 else 1 end)
        else (case when s.x < 0 then -1 else 1 end)
      end as facing
    ) f
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

-- Probe (run after; expect one row: games <= 1312 for a full 2025-26; cells <= 25; slot_share a little LOWER
-- than before, since the own-end shots no longer sit in the slot):
--   select (j->>'games')::int as games, (j->>'attempts')::int as attempts,
--          round((j->>'slotSog')::numeric / nullif((j->>'sog')::numeric, 0), 3) as slot_share,
--          jsonb_array_length(j->'cells') as cells
--   from (select public.lamp_league_shot_grid(20252026) as j) q;
-- And the size of the bug (own-end shots on goal the old rule mirrored into the slot; expect about 2,300 across
-- the shots on goal, fewer in the slot itself):
--   select count(*) filter (where zone = 'D' and result in ('sog','goal') and abs(x) between 69 and 89 and abs(y) <= 22) as was_mirrored_into_slot
--   from public.lamp_shots where season = 20252026 and game_type = 2;
