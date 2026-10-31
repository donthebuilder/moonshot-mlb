-- FALSE HOMERS (2026-10-31): homer_feed rows are written from the LIVE boxscore count, which can show a home run that is later overturned or corrected (3 of 1,111
-- man-games since 08-22; none a called man). When the game is final and the league's own box score has fewer home runs for him than the feed has rows, the extra
-- rows are COPIED here (with the reason and the box score's count) and removed from homer_feed, so every reader (record, receipts, ledger, cards) is right at once and
-- nothing is lost. lib/dash/homerVoid.js; the tick never re-inserts a key listed here (the post stays: a public post cannot be unsent).
-- Additive, idempotent, service role only. PROBE (must return 1 row, then 0 rows in the table): select count(*) from information_schema.tables where table_name = 'homer_feed_voids';
create table if not exists public.homer_feed_voids (
  day          date        not null,
  player_id    text        not null,
  hr_n         integer     not null,
  game_pk      text,
  name         text,
  box_hr       integer     not null,                    -- his home runs in the final box score
  reason       text        not null default 'box score has fewer home runs than the feed',
  voided_at    timestamptz not null default now(),
  row          jsonb       not null,                    -- the whole homer_feed row as it was (post ids included, for a manual clean-up)
  primary key (day, player_id, hr_n)
);
alter table public.homer_feed_voids enable row level security;
revoke all on table public.homer_feed_voids from anon, authenticated;
-- UNDO: drop table public.homer_feed_voids;  (a voided row can be put back from its `row` column)
