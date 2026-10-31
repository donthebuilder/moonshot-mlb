-- THE FIRST SCORER'S NAME, ON THE OPENING ROW (2026-10-31, TUDDY's first-TD wall across two seasons). first_score_player is the scorer's id when the
-- roster join found him; the name comes straight from ESPN's scoring play, so a wall can label a man whose id never resolved and a season with no live
-- feed to join (2025). Written by lib/nfl/openings.js (the tick and scripts/backfill-nfl-openings.mjs). Other sports leave it null.
--
-- Additive and idempotent. Games already on file stay null until `backfill-nfl-openings.mjs --fill-names` re-reads them.
-- PROBE (must return 1 row):
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'opening_games' and column_name = 'first_score_name';
-- UNDO: alter table public.opening_games drop column first_score_name;

alter table public.opening_games add column if not exists first_score_name text;
