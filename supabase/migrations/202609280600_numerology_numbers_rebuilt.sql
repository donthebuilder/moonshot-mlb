-- HOT NUMBERS: nights REBUILT after the fact (2026-09-27, HOT-NUMBERS-FIX item 3).
--
-- TRENDING was empty for weeks because numerology_numbers only fills as each
-- night is graded. MOONSHOT's last 14 nights can be rebuilt from real data
-- (the bot's slate_<date>_slim.json = who was on the slate, homer_feed = who
-- homered, MLB people = jersey / birth date). Those nights were NOT frozen
-- pregame, so they are flagged here: they count in Hot Numbers' TRENDING and
-- the page says how many are rebuilt, but they are never part of the graded
-- lane record (numerology_log / numerology_lane_nights are untouched).
--
-- Idempotent: safe to run twice. Run BEFORE the code that reads the column.
alter table public.numerology_numbers
  add column if not exists rebuilt boolean not null default false;

-- Probe (after running): expect one row, data_type boolean.
-- select column_name, data_type, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'numerology_numbers' and column_name = 'rebuilt';
