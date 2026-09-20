-- nfl_td_feed.td_board — the pregame board seat, finally persisted.
--
-- 2026-09-20. lib/nfl/tdFeed.js's buildTdEvent() has computed a full-board TD
-- rank for every scorer since 09-14 (boardRankFor(): every player the slate
-- carries a TD score for, ranked). rowFromEvent() never wrote it, so
-- eventFromRow() — which is what BOTH the card and the post text are built
-- from, deliberately, so a later roster publish cannot change what an
-- already-live post claims — rebuilt every event with tdBoard undefined.
--
-- Consequence: the middle of the product's three states (project rule 14 —
-- CALLED / ON THE BOARD / NOT ON THE BOARD) has never rendered. A scorer the
-- model rated 6th of 214 and a scorer it never surfaced produced an identical
-- post and an identical card. tdPostText()'s tdBoard branch was unreachable.
--
-- Nullable, no backfill: the rank has to be the one frozen at post time, and
-- for touchdowns already posted that number is gone. Already-live rows stay
-- honestly blank rather than getting today's board stamped on last week's
-- score.
alter table public.nfl_td_feed add column if not exists td_board jsonb;

-- jersey — his number, for the cards (2026-09-20, "add jersey numbers and
-- such"). Published per player on the slate the roster join already reads, so
-- this is a carry, not a new lookup. Nullable: a scorer whose name didn't
-- resolve gets no number rather than a guessed one.
alter table public.nfl_td_feed add column if not exists jersey smallint;
