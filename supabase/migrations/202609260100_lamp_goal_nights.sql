-- LAMP GOAL NIGHTS — the record's per-night counts, counted in Postgres.
--
-- 2026-09-26. /api/lamp/record (the LAMP Results tab) used to read every
-- graded lamp_goal_log row in its window (up to 120 nights, ~600 rows a
-- regular-season night) and count them in JS. Paged correctly that is
-- 40k-80k rows per uncached call. The page only needs the counts below
-- plus two short lists (called rows, scorers who weren't called), so the
-- counting moves here.
--
-- A VIEW, NOT A TABLE: nothing new is stored and nothing has to be kept in
-- sync. It is computed on read from lamp_goal_log, so a graded row is in it
-- the moment the tick writes the grade. Every column mirrors coverage() in
-- lib/nhl/goalModel.js exactly:
--   dressed        rows where the man dressed (void = not dressed, left out)
--   scorers        dressed and hit
--   scorers_*      scorers by the status stored at lock
--   called_n/hits  dressed CALLED rows, and how many scored
--   bN_n/bN_hits   dressed rows by in-game rank band: 1-3, 4-8, 9-15, 16+
-- Grouped by game_type too, so preseason can be left out by the reader.
--
-- security_invoker: the reader's own rights apply, i.e. the table's
-- read-for-all policy -- the view exposes nothing the table doesn't.
--
-- Probe after running:
--   select game_date, game_type, scorers, scorers_called
--   from public.lamp_goal_nights where model_version = 'lamp-goal-v1';
--   -> 2026-09-25 · 1 · 20 · 3   (LAMP's first graded night, preseason)

create or replace view public.lamp_goal_nights
with (security_invoker = true) as
select
  model_version,
  game_date,
  game_type,
  count(distinct game_id)                                                     as games,
  count(*) filter (where dressed)                                             as dressed,
  count(*) filter (where dressed and hit)                                     as scorers,
  count(*) filter (where dressed and hit and status = 'called')               as scorers_called,
  count(*) filter (where dressed and hit and status = 'board')                as scorers_board,
  count(*) filter (where dressed and hit and status = 'off')                  as scorers_off,
  count(*) filter (where dressed and status = 'called')                       as called_n,
  count(*) filter (where dressed and status = 'called' and hit)               as called_hits,
  count(*) filter (where dressed and rank_in_game between 1 and 3)            as b1_n,
  count(*) filter (where dressed and rank_in_game between 1 and 3 and hit)    as b1_hits,
  count(*) filter (where dressed and rank_in_game between 4 and 8)            as b2_n,
  count(*) filter (where dressed and rank_in_game between 4 and 8 and hit)    as b2_hits,
  count(*) filter (where dressed and rank_in_game between 9 and 15)           as b3_n,
  count(*) filter (where dressed and rank_in_game between 9 and 15 and hit)   as b3_hits,
  count(*) filter (where dressed and rank_in_game between 16 and 999)         as b4_n,
  count(*) filter (where dressed and rank_in_game between 16 and 999 and hit) as b4_hits
from public.lamp_goal_log
where graded_at is not null
group by model_version, game_date, game_type;

grant select on public.lamp_goal_nights to anon, authenticated, service_role;
