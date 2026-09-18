-- Widen homer_feed_posts_kind_check for TUDDY's weekly content engine
-- (2026-09-18, Donovan's seven-format NFL content plan; the four that needed
-- no new bot work shipped first). Adds:
--   'nfl_redzone'     Wed 10am ET -- RED ZONE TARGETS   (players[].stats.RZ)
--   'nfl_goalline'    Wed  1pm ET -- GOAL LINE WATCH    (players[].stats.GL)
--   'nfl_tdhistory'   Thu 11am ET -- NFL TOUCHDOWN HISTORY vs this week's
--                                    opponent (nfl_logs joined on `opp`)
--   'nfl_whyboard'    Fri 10am ET -- WHY HE'S ON THE BOARD (components.TD)
--   'nfl_bigweek'     Mon 10am ET -- BIG WEEK, one QB/RB/WR off the live
--                                    box score (nfl_fantasy_stats.json)
--
-- Before this, TUDDY's entire scheduled surface was ONE kind ('nfl_milestone')
-- on two days a week. Same constraint and the same silent-no-op failure mode
-- as the ten kind-widen migrations before it: until this runs, every one of
-- the five claims fails Postgres 23514, inserts nothing, posts nothing, and
-- says so only in the Vercel function log.
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
    'hot_month', 'hot_week',
    'nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nfl_whyboard', 'nfl_bigweek'
  ));
