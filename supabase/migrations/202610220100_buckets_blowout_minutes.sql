-- BUCKETS: WHO GAINS IN A BLOWOUT (2026-10-22, Donovan: "who gains minutes in a blowout (bench scorers)"). The blowout watch
-- (lib/blowout.js) flags a game when the book has a club favoured by 10+; this answers who plays MORE when that happens. For a
-- list of players (tonight's two rosters) over the seasons asked (this one + last), each man's minutes and points in his club's
-- lopsided finals (margin >= p_margin, either side) against the rest. A game's margin is the two clubs' summed box points
-- (buckets_box holds every man who played, so the sums are the final score). Regular season only. Sums in Postgres: a few
-- dozen small rows leave the database, never raw box rows (egress).
--
-- Additive and idempotent: one new function. RLS unchanged; service_role only (BUCKETS is hidden).
-- PROBE: select * from public.buckets_blowout_minutes(array['3992'], array[2026], 15);

create or replace function public.buckets_blowout_minutes(p_players text[], p_seasons integer[], p_margin integer)
returns table (player_id text, name text, blow_gp integer, blow_min numeric, blow_pts numeric, rest_gp integer, rest_min numeric, rest_pts numeric)
language sql stable as $$
  with pts as (
    select game_id, team, sum(coalesce(pts, 0)) s from public.buckets_box
    where season = any(p_seasons) and season_type = 2
    group by game_id, team
  ), margin as (
    select a.game_id, abs(a.s - b.s) m from pts a join pts b on b.game_id = a.game_id and b.team > a.team
  ), mine as (
    select x.player_id, x.name, x.game_date, x.min, x.pts, (mg.m >= p_margin) blow
    from public.buckets_box x join margin mg on mg.game_id = x.game_id
    where x.player_id = any(p_players) and x.season = any(p_seasons) and x.season_type = 2
  )
  select player_id, (array_agg(name order by game_date desc))[1],
    (count(*) filter (where blow))::int, round(avg(min) filter (where blow)::numeric, 1), round(avg(pts) filter (where blow)::numeric, 1),
    (count(*) filter (where not blow))::int, round(avg(min) filter (where not blow)::numeric, 1), round(avg(pts) filter (where not blow)::numeric, 1)
  from mine group by player_id
$$;

revoke execute on function public.buckets_blowout_minutes(text[], integer[], integer) from public, anon, authenticated;
grant execute on function public.buckets_blowout_minutes(text[], integer[], integer) to service_role;
