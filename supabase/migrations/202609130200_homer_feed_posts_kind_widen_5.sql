-- Widen homer_feed_posts_kind_check for the 3 new Section-8 engagement
-- tweets (2026-09-13, Donovan: "add the pair history minimla like the
-- tweets 6 we need to build" -- picking Results/Accountability, Community
-- Pick, and Bot vs. People off the engagement-tweet list). Adds
-- 'accountability', 'community_pick', 'botpoll'. Model vs Market stays out
-- (still on hold, no calibrated probability exists) and Weekly Bot Report
-- stays out (Donovan didn't pick it this round).
--
-- Same constraint, same silent-no-op failure mode as the five migrations
-- before it (...widen.sql through ...widen_4.sql). THIS MUST RUN BEFORE
-- app/api/dash/homers/tick/route.js's next live firing, or all three new
-- claim attempts fail Postgres 23514 forever, silently -- the route logs
-- it, but nothing surfaces unless someone reads the Vercel function logs.
--
-- No new column, no new table.
alter table public.homer_feed_posts drop constraint if exists homer_feed_posts_kind_check;
alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check
  check (kind in (
    'pregame', 'recap', 'weekly', 'monthly', 'pairswatch', 'longshot', 'numerology',
    'hotcontact', 'dangercombos', 'hrleadersdow', 'hotcontact_mid', 'dangercombos_mid',
    'birthday', 'backtoback', 'funfacts',
    'thefour', 'bestair', 'storylines', 'callofnight', 'matchuplines', 'streaks',
    'nfl_milestone',
    'accountability', 'community_pick', 'botpoll'
  ));
