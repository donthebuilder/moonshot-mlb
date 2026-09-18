-- Widen homer_feed_posts_kind_check for THE MERGE (2026-09-18, Donovan:
-- "add more to the tweet this what im saying like the storylin and stuff
-- acna bee really big tweet or two"). Adds:
--   'angles'    9am ET -- TONIGHT'S ANGLES: arms getting hit + matchups +
--                         best air + closing in + streak + revenge + birthdays
--   'hotsheet' 11am ET -- THE HOT SHEET: hottest contact + hot bat vs hittable
--                         arm + went deep last time out + HR leaders by weekday
--
-- These two REPLACE eighteen thin slots, which stop posting on the same push
-- (RETIRED_KINDS in app/api/dash/homers/tick/route.js). Nothing is dropped from
-- the constraint: a retired kind's rows already exist and re-enabling one is a
-- one-line code change, not another migration.
--
-- Same constraint and the same silent-no-op failure mode as the eleven
-- kind-widen migrations before it: until this runs, both claims fail Postgres
-- 23514, insert nothing, post nothing, and say so only in the Vercel log.
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
    'hot_month', 'hot_week',
    'nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nfl_whyboard', 'nfl_bigweek',
    'angles', 'hotsheet'
  ));
