-- Widen homer_feed_posts_kind_check for THE HOT STRETCH
-- (2026-09-18, Donovan: "i want player highlights liike this too -- Ronald
-- Acuña Jr in September: .339 AVG / .364 OBP / .661 SLG / 1.025 OPS / 5 HR /
-- 13 RBI ... for players doing well during the week or throught the month").
-- Adds:
--   'hot_month'  (7am ET, HOT_MONTH_HOUR in app/api/dash/homers/tick/route.js)
--   'hot_week'   (5pm ET, HOT_WEEK_HOUR)
--
-- Same constraint, same silent-no-op failure mode as the nine migrations
-- before it (...widen.sql through ...widen_9.sql). Verified live on
-- 2026-09-18 that an insert with kind='hot_month' is refused today with
-- Postgres 23514, so THIS MUST RUN BEFORE the tick route's next live firing
-- or both new posts claim nothing, post nothing, and say nothing about it
-- outside the Vercel function log.
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
    'revenge_giveaway',
    'hot_month', 'hot_week'
  ));
