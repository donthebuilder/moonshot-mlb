-- homer_feed.mlbhr_post_id / mlbhr_reply_id — the @MLBHR reply pass.
--
-- 2026-09-22. @MLBHR posts every home run in baseball to 424,000 followers.
-- When the board called a hitter who just went deep, this account replies
-- under their post with the card. Two columns, same shape as reply_post_id:
--
--   mlbhr_post_id   their tweet, the one we replied to
--   mlbhr_reply_id  null      = still owed, next tick retries
--                   an X id   = done, and queryable
--                   'skipped' = decided and done (no call, nothing to say)
--
-- No backfill. Replying today under a home run from three nights ago is not a
-- receipt, it is spam, and their post has long since left everyone's feed.
--
-- RUN THIS BEFORE THE PUSH. The pass SELECTs mlbhr_reply_id, so until the
-- column exists every tick's query errors and the pass logs and skips.
alter table public.homer_feed add column if not exists mlbhr_post_id text;
alter table public.homer_feed add column if not exists mlbhr_reply_id text;

create index if not exists homer_feed_mlbhr_owed_idx
  on public.homer_feed (day)
  where mlbhr_reply_id is null;
