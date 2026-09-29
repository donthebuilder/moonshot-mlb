-- LAMP SHOT DEPTH (2026-09-28): why a shot missed. The play-by-play gives
-- every missed shot a details.reason (wide-left, wide-right,
-- high-and-wide-left, above-crossbar, hit-left-post, hit-crossbar, short,
-- failed-bank-attempt, ...); lamp_shots dropped it. Kept as given, misses
-- only (null on goals, shots on goal and blocks). Rows written before this
-- stay null until scripts/backfill-lamp-shots.mjs re-upserts them (same
-- (game_id, event_id), same values plus this one).
--
-- RUN THIS BEFORE the code that writes it ships. That code also survives
-- without it (it retries the write without the column), so nothing breaks
-- if the order slips -- the reasons just aren't kept until this runs.
-- Idempotent: safe to run twice.

alter table public.lamp_shots add column if not exists miss_reason text;

-- Probe: select column_name from information_schema.columns
--        where table_name = 'lamp_shots' and column_name = 'miss_reason';
