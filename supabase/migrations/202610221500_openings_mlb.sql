-- MOONSHOT'S OPENINGS (2026-10-22, Donovan: "for [baseball] it just be whatever that opening is, first inning, first hit";
-- the core lanes: "a real first everything model"). Plan: claude/BATCH-FIRSTS-PLAN-2026-10-22.txt.
--
-- The openings tables (202610221300_openings.sql) are one shape for every sport. Baseball fits most of it as it is:
--   p1_home_pts / p1_away_pts   runs in the 1st inning
--   first_att_*                  the game's first plate appearance (clock_s = 1)
--   first_score_*                the game's first RUN: the club, the runner who scored it, the plate-appearance number of the
--                                game it came on (clock_s), the runs on that play (pts)
--   p1_att / p1_made             his plate appearances / hits in the 1st inning
-- These columns are the part only baseball has: the first hit and the first homer of the game, the batting-order slot, and the
-- rest of his 1st inning. Every other sport leaves them null.
--
-- Additive and idempotent. RLS is already on for both tables (service_role only).
-- PROBE (every value must be true):
--   select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'opening_games' and column_name = 'first_hr_pa') as games_cols,
--          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'opening_players' and column_name = 'p1_rbi') as players_cols;
-- UNDO: alter table ... drop column for each column below (the NBA rows never use them).

alter table public.opening_games
  add column if not exists first_hit_team   text,
  add column if not exists first_hit_player text,
  add column if not exists first_hit_pa     smallint,   -- the game's plate-appearance number it came on (1 = the first batter)
  add column if not exists first_hr_team    text,
  add column if not exists first_hr_player  text,
  add column if not exists first_hr_pa      smallint;

alter table public.opening_players
  add column if not exists bat_order smallint,           -- 1-9, the slot he started in (null off the bench)
  add column if not exists p1_hr     smallint,           -- 1st inning: homers, total bases, runs scored, runs batted in
  add column if not exists p1_tb     smallint,
  add column if not exists p1_runs   smallint,
  add column if not exists p1_rbi    smallint;

-- ONE READ, NOT FORTY-FIVE: a season is ~2,500 games and ~45,000 starter rows, and PostgREST pages 1,000 at a time. The site's
-- /api/mlb/openings reads both tables through this one call (compact arrays, in the column order below) and counts in
-- JavaScript (lib/mlb/openingsAgg.js). Until this function exists the route pages the tables instead, so the order the SQL and
-- the code ship in doesn't matter.
-- PROBE: select jsonb_array_length(public.opening_rows_mlb(2026, array[2,3]::smallint[]) -> 'games') > 0 as has_games;
-- UNDO: drop function public.opening_rows_mlb(integer, smallint[]);
create or replace function public.opening_rows_mlb(p_season integer, p_types smallint[])
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'games', coalesce((
      select jsonb_agg(jsonb_build_array(game_id, game_date, home, away, first_score_team, first_score_player,
                                         first_hit_team, first_hit_player, first_hr_team, first_hr_player, p1_home_pts, p1_away_pts))
      from public.opening_games where sport = 'mlb' and season = p_season and season_type = any(p_types)), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_array(game_id, player_id, name, team, pos, starter, bat_order, p1_att, p1_made, p1_hr, p1_tb, p1_runs))
      from public.opening_players where sport = 'mlb' and season = p_season and season_type = any(p_types) and starter), '[]'::jsonb)
  )
$$;
revoke all on function public.opening_rows_mlb(integer, smallint[]) from public, anon, authenticated;
grant execute on function public.opening_rows_mlb(integer, smallint[]) to service_role;
