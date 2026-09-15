-- Widen homer_feed_posts_kind_check for Milestone Watch (2026-09-15,
-- Donovan: "milestones do 2 different sets of players two different times a
-- day" -- part of the "spread tweets throughout the day, use real site data"
-- pass). Adds 'milestone_am' (6am ET, MILESTONE_AM_HOUR in
-- app/api/dash/homers/tick/route.js) and 'milestone_mid' (3pm ET,
-- MILESTONE_MID_HOUR, excludes whoever the AM wave already named).
--
-- Same constraint, same silent-no-op failure mode as the seven migrations
-- before it (...widen.sql through ...widen_7.sql). THIS MUST RUN BEFORE
-- the tick route's next live firing, or both new claim attempts fail
-- Postgres 23514 forever, silently -- the route logs it, but nothing
-- surfaces unless someone reads the Vercel function logs.
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
    'board', 'board_results',
    'matchup_hr', 'matchup_career', 'matchup_hr_late', 'matchup_career_late',
    'milestone_am', 'milestone_mid'
  ));
