-- LAMP · WHO SCORES ON A GOALIE, AND FROM WHICH SIDE (2026-10-13). Donovan: "the goalie gives it up to C / W / D,
-- and even specific sides". One read-only function: for a season, every goalie's shots on goal and goals against
-- split two ways, and the league's split of the same shots.
--
--   BY THE SCORER'S POSITION  C / W / D (L and R wings are one W), from lamp_goal_log.pos -- the only place a skater's
--                  position is stored. His LATEST logged position is used for every season (lamp_goal_log opened
--                  2026-09-29, so a skater who has not dressed on a logged night this season has no position: 'unk',
--                  counted and shown, never guessed).
--   BY THE SIDE OF THE ICE  where the shot came from, the same normalising as lamp_goalie_zones (x < 0 -> (-x, -y)):
--                  left   y >  9   (the shooter's left of the net)
--                  right  y < -9
--                  mid    |y| <= 9 (the lane between the dots, straight on)
--
-- WHAT IS NOT IN THE DATA, so not in this function: which way the SHOOTER shoots (left- or right-handed). lamp_shots has
-- no handedness and nothing else in the database stores it; and where in the net a shot went (no net location in the
-- public feed). Side here is the side of the ice, nothing more.
--
-- Regular season, shots on goal and goals (result in sog, goal), a goalie in the net, shootout shots left out. Same
-- scope as lamp_goalie_zones. SERVICE ROLE ONLY (like the table): no execute for anon / authenticated.
-- Idempotent: safe to run twice. RUN BEFORE the goalie page's new section ships (it stays hidden until this answers).

create or replace function public.lamp_goalie_giveups(p_season integer)
returns jsonb language sql stable set search_path = public as $$
  with pos as (
    select distinct on (player_id) player_id,
           case when pos in ('L', 'R') then 'W' when pos in ('C', 'D') then pos end as p
    from public.lamp_goal_log
    where pos is not null
    order by player_id, game_date desc, game_id desc
  ),
  s as (
    select sh.goalie_id, (sh.result = 'goal') as goal, coalesce(pos.p, 'unk') as p,
           case when (case when sh.x < 0 then -sh.y else sh.y end) > 9 then 'left'
                when (case when sh.x < 0 then -sh.y else sh.y end) < -9 then 'right'
                else 'mid' end as side
    from public.lamp_shots sh
    left join pos on pos.player_id = sh.player_id
    where sh.season = p_season and sh.game_type = 2 and sh.goalie_id is not null
      and sh.x is not null and sh.y is not null and sh.result in ('sog', 'goal')
      and coalesce(sh.period_type, '') <> 'SO'
  ),
  cut as (
    -- one row per (goalie, kind, key): shots and goals; goalie_id 0 = the league
    select goalie_id, 'pos' as kind, p as k, count(*) as sa, count(*) filter (where goal) as ga from s group by goalie_id, p
    union all
    select goalie_id, 'side', side, count(*), count(*) filter (where goal) from s group by goalie_id, side
    union all
    select 0, 'pos', p, count(*), count(*) filter (where goal) from s group by p
    union all
    select 0, 'side', side, count(*), count(*) filter (where goal) from s group by side
  ),
  one as (
    select goalie_id,
           jsonb_object_agg(kind || ':' || k, jsonb_build_object('sa', sa, 'ga', ga)) as cuts,
           sum(sa) filter (where kind = 'side') as sa, sum(ga) filter (where kind = 'side') as ga
    from cut group by goalie_id
  )
  select jsonb_build_object(
    'season', p_season,
    'league', (select jsonb_build_object('sa', sa, 'ga', ga, 'cuts', cuts) from one where goalie_id = 0),
    'goalies', coalesce((select jsonb_agg(jsonb_build_object('goalie', goalie_id, 'sa', sa, 'ga', ga, 'cuts', cuts) order by goalie_id) from one where goalie_id <> 0), '[]'::jsonb)
  )
$$;

revoke all on function public.lamp_goalie_giveups(integer) from public, anon, authenticated;
grant execute on function public.lamp_goalie_giveups(integer) to service_role;

-- PROBE (run after; the position cut and the side cut must each add up to the goalie's own totals):
--   with j as (select public.lamp_goalie_giveups(20252026) as v)
--   select (v->'league'->>'sa')::int as league_sa, (v->'league'->>'ga')::int as league_ga,
--          (select sum((c->>'sa')::int) from jsonb_each(v->'league'->'cuts') e(k, c) where k like 'pos:%') as pos_sa,
--          (select sum((c->>'ga')::int) from jsonb_each(v->'league'->'cuts') e(k, c) where k like 'pos:%') as pos_ga,
--          jsonb_array_length(v->'goalies') as goalies
--   from j;            -- expect pos_sa = league_sa and pos_ga = league_ga (2025-26 from the same read in JS: 72554 shots, 7578 goals)
--   select (public.lamp_goalie_giveups(20262027)->'league'->>'ga')::int;   -- this season so far
