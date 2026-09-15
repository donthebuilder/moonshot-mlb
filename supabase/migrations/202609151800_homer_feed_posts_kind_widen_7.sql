-- Widen homer_feed_posts_kind_check for the matchup-history posts
-- (2026-09-15, Donovan: someone requested a fan account's "has a HR vs
-- tonight's starter" list; confirmed he wants BOTH that and the
-- best-batting-line "who owns him" trivia, kept as a pool that fires again
-- later in the day for the later games -- "this can fire later in the day
-- or middle slate for a liter game"). Adds four kinds: 'matchup_hr' and
-- 'matchup_career' (the day wave, gated on MATCHUP_HOUR in
-- app/api/dash/homers/tick/route.js) and their late-wave twins
-- 'matchup_hr_late' / 'matchup_career_late' (gated on MATCHUP_LATE_HOUR,
-- excluding whoever the day wave already named).
--
-- Same constraint, same silent-no-op failure mode as the six migrations
-- before it (...widen.sql through ...widen_6.sql). THIS MUST RUN BEFORE
-- the tick route's next live firing, or all four new claim attempts fail
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
    'matchup_hr', 'matchup_career', 'matchup_hr_late', 'matchup_career_late'
  ));
