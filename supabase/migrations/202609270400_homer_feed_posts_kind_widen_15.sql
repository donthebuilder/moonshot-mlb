-- Widen homer_feed_posts_kind_check (2026-09-27). Adds FOUR kinds:
--   'history_watch'  MLB, the AM History watch post. SHIPPED 09-26 WITHOUT
--                    this -- probed 09-27: an insert with this kind is refused
--                    (Postgres 23514), so the post has never gone out. Same
--                    silent no-op as every widen before it.
--   'longshots'      MLB, from 1pm ET (lib/dash/longshotsPost.js)
--   'nfl_longshots'  NFL, Sunday from 11:45am ET
--   'nhl_longshots'  NHL, from 5pm ET (the LAMP tick)
-- Everything else is widen_14's list, unchanged. Idempotent.
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
    'angles', 'hotsheet',
    'nfl_board', 'nfl_botpoll', 'nfl_community', 'nfl_results',
    'nfl_spotlight',
    'history_watch', 'longshots', 'nfl_longshots', 'nhl_longshots'
  ));

-- Probe (should return one row whose definition names nhl_longshots):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
