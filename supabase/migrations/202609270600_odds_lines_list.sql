-- odds_lines: also keep the MORNING read (snap 'list') of every market we
-- score (2026-09-27), so MOONSHOT's prices (/api/odds/latest -> the Odds tab,
-- props grid, pick quotes) show hits / total bases / H+R+RBI from the morning,
-- not only ~1 hour before each game. Same SGO objects, no extra API cost.
-- Idempotent.
alter table public.odds_lines drop constraint if exists odds_lines_snap_check;
alter table public.odds_lines add constraint odds_lines_snap_check check (snap in ('list', 'lock', 'close'));
-- Probe:  select pg_get_constraintdef(oid) from pg_constraint where conname = 'odds_lines_snap_check';
