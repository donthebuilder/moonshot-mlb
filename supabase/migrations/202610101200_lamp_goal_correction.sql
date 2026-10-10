-- LAMP GOAL CORRECTION (2026-10-10): a CALLED goal we already posted is later overturned on review.
-- The tick posts ONE reply under the original tweet and ONE channel card, once per goal. Additive, nullable, idempotent.
--   discord_sent         did the original alert's channel copy go out (true/false; null = the row predates this column)
--   correction_post_id   the correction's claim: null -> 'posting' (claimed) -> the reply's tweet id, or 'skipped' (closed)
--   correction_discord_at when the channel correction went out (so a retry of the X reply never re-sends it)
-- Nothing existing is rewritten; the original post, the grade and the ledger do not read these columns.
alter table public.lamp_goal_feed add column if not exists discord_sent          boolean;
alter table public.lamp_goal_feed add column if not exists correction_post_id    text;
alter table public.lamp_goal_feed add column if not exists correction_discord_at timestamptz;

-- Probe (three rows, one per column):
--   select column_name from information_schema.columns where table_name = 'lamp_goal_feed' and column_name in ('discord_sent', 'correction_post_id', 'correction_discord_at');
