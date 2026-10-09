-- X overhaul, stage 3 piece 1 (2026-10-09): count the NFL call-sheet replies.
-- The reply under a CALLED touchdown alert is its own automated X post, and the
-- daily cap (lib/dash/xBudget.js) must count it; it was stored nowhere. The code
-- writes this column best-effort and counts it; until this has run, the count is
-- estimated from the rows that qualify for a reply (it can only over-count).
-- NOT RUN. Safe: additive, nullable, no default, no rewrite.
alter table public.nfl_td_feed add column if not exists reply_x_post_id text;

-- probe (after running): returns one row with data_type = text
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'nfl_td_feed' and column_name = 'reply_x_post_id';
