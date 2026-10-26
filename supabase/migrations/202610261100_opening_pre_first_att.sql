-- SHOTS TO THE FIRST MAKE (2026-10-26, Donovan: "shots to 1st FG" on the first-basket board). Each club's field-goal attempts in
-- Q1 up to and including the game's first made field goal, counted in the grade tick's (and the backfill's) pass over the plays
-- (lib/nba/openings.js). Null when no first make was on file. Other sports' parsers leave them null.
--
-- Additive and idempotent. Existing rows stay null until the openings backfill is re-run for them (see the backfill notes).
-- PROBE (must return 2 rows):
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'opening_games' and column_name in ('pre_first_att_home', 'pre_first_att_away');

alter table public.opening_games add column if not exists pre_first_att_home smallint;
alter table public.opening_games add column if not exists pre_first_att_away smallint;
