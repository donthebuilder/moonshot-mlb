-- THE SILENT NO-OP (2026-09-07). homer_feed_posts_kind_check has only ever
-- allowed 'pregame', 'recap', 'weekly' -- but app/api/dash/homers/tick's own
-- code has been posting under 'monthly', 'pairswatch', 'longshot' and
-- 'numerology' too since 2026-09-06, and every one of those upsert calls
-- only reads back `data`, never `error`. Every claim attempt under those
-- four kinds has been silently violating this constraint and inserting
-- NOTHING since the day each shipped -- confirmed directly against
-- production: the table holds exactly one row, ever ('pregame',
-- 2026-09-06), and reproducing the exact upsert against a throwaway row
-- returns postgres 23514 / homer_feed_posts_kind_check. Pairs to watch,
-- the longest call, the numerology moment and the weekly/monthly recaps
-- have never actually posted, silently, this whole time.
--
-- Widened to the full set the app already tries to use, plus the three new
-- stat-feed posts (Donovan, 2026-09-07: "types of tweets I'd like to see
-- automated with the sites data") and their mid-slate reposts.
alter table public.homer_feed_posts drop constraint if exists homer_feed_posts_kind_check;
alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check
  check (kind in (
    'pregame', 'recap', 'weekly', 'monthly', 'pairswatch', 'longshot', 'numerology',
    'hotcontact', 'dangercombos', 'hrleadersdow', 'hotcontact_mid', 'dangercombos_mid'
  ));
