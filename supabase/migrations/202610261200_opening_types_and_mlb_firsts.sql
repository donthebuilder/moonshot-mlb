-- WHAT THE FIRST SCORE WAS, AND MLB'S PER-CLUB COUNTS TO THE FIRST HIT / HOMER (2026-10-26, Donovan: "clear the gaps").
--   first_att_type / first_score_type   the game's first attempt and first score, one word in each sport's own vocabulary
--       (lib/openings/shotType.js): nba '3PT' | '2PT Jumper' | 'Layup' | 'Dunk' | 'Hook' | 'Tip'; nhl the league's shot type (wrist,
--       snap, slap, backhand, tip-in, ...); nfl 'rush' | 'pass' | 'return'; mlb the play's result (single, home_run, ...). Null when
--       the feed doesn't say.
--   pre_first_hit_home/away, pre_first_hr_home/away   MLB: each club's plate appearances up to and including the first hit / first homer
--       (the same count 202610261100 added for the first run). Other sports leave them null.
--
-- Additive and idempotent. Existing rows stay null until each backfill's --fill-pre-att pass re-reads them.
-- PROBE (must return 6 rows):
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'opening_games'
--     and column_name in ('first_att_type', 'first_score_type', 'pre_first_hit_home', 'pre_first_hit_away', 'pre_first_hr_home', 'pre_first_hr_away');

alter table public.opening_games add column if not exists first_att_type text;
alter table public.opening_games add column if not exists first_score_type text;
alter table public.opening_games add column if not exists pre_first_hit_home smallint;
alter table public.opening_games add column if not exists pre_first_hit_away smallint;
alter table public.opening_games add column if not exists pre_first_hr_home smallint;
alter table public.opening_games add column if not exists pre_first_hr_away smallint;
