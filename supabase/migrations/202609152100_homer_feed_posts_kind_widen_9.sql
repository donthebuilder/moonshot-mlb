-- Widen homer_feed_posts_kind_check for Storyline Watch + Revenge & Giveaways
-- (2026-09-15, Donovan: "storylies post 4 a day once slate starts for games
-- that havent started and thing else post in ca combined tweet" -- the
-- second half of the real-site-data pass that started with Milestone Watch
-- in ...widen_8.sql). Adds:
--   'storyline_watch_1' .. 'storyline_watch_4'  (5pm/8pm/9pm/10pm ET,
--     STORYLINE_WATCH_1_HOUR..STORYLINE_WATCH_4_HOUR in
--     app/api/dash/homers/tick/route.js)
--   'revenge_giveaway'  (7am ET, REVENGE_GIVEAWAY_HOUR)
--
-- Same constraint, same silent-no-op failure mode as the eight migrations
-- before it (...widen.sql through ...widen_8.sql). THIS MUST RUN BEFORE the
-- tick route's next live firing, or all five new claim attempts fail
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
    'milestone_am', 'milestone_mid',
    'storyline_watch_1', 'storyline_watch_2', 'storyline_watch_3', 'storyline_watch_4',
    'revenge_giveaway'
  ));
