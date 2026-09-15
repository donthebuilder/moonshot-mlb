-- Widen homer_feed_posts_kind_check for Tonight's Board (2026-09-15,
-- Donovan: "should we post ... role based tweets no cards just text" /
-- "do the recemmomdend but maks sure its graded"). Adds 'board' (the
-- pregame, one-pick-per-role TOP/HR/HIT/HRR text post) and 'board_results'
-- (the next-morning grading of those same picks against real box scores).
--
-- Same constraint, same silent-no-op failure mode as the six migrations
-- before it (...widen.sql through ...widen_5.sql). THIS MUST RUN BEFORE
-- app/api/dash/homers/tick/route.js's next live firing, or both new claim
-- attempts fail Postgres 23514 forever, silently -- the route logs it, but
-- nothing surfaces unless someone reads the Vercel function logs.
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
    'accountability', 'community_pick', 'botpoll',
    'board', 'board_results'
  ));
