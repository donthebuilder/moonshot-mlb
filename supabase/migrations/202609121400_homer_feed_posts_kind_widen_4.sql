-- Widen homer_feed_posts_kind_check for the first automated NFL post
-- (2026-09-12, Donovan: "next please" -- Storylines' third original Phase 3
-- piece, automated social posting). Adds 'nfl_milestone' only -- the
-- Milestone/streak angle, per Donovan's own scoping answer ("Milestone
-- only, for now"). Model narrative is deliberately not added here; see
-- lib/nfl/tweetFeed.js's header for why, and add its own kind later if that
-- ever changes.
--
-- Same constraint, same silent-no-op failure mode as the four migrations
-- before it (...widen.sql, ...widen_2.sql, ...widen_3.sql). THIS MUST RUN
-- BEFORE app/api/dash/nfl/tick/route.js's first live firing, or its claim
-- attempt fails Postgres 23514 forever, silently -- the route logs it, but
-- nothing surfaces unless someone reads the Vercel function logs.
--
-- No new column, no new table: 'day' stays the real calendar date of each
-- Thursday/Sunday NFL post; homer_feed_posts.day is already a Postgres
-- `date`, so a Thursday and its Sunday are naturally two different rows
-- under the same kind -- that's the whole "couple of slots a week."
alter table public.homer_feed_posts drop constraint if exists homer_feed_posts_kind_check;
alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check
  check (kind in (
    'pregame', 'recap', 'weekly', 'monthly', 'pairswatch', 'longshot', 'numerology',
    'hotcontact', 'dangercombos', 'hrleadersdow', 'hotcontact_mid', 'dangercombos_mid',
    'birthday', 'backtoback', 'funfacts',
    'thefour', 'bestair', 'storylines', 'callofnight', 'matchuplines', 'streaks',
    'nfl_milestone'
  ));
