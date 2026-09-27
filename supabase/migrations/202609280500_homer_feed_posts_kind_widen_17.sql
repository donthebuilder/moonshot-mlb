-- Widen homer_feed_posts_kind_check (2026-09-27, BATCH-LIST-POSTS step 1).
-- Adds the LIST POST, one kind per sport:
--   'list_mlb'   MOONSHOT (played every game, iron man, 30/40-HR club, 20-20,
--                a homer every month, CALLED IT season, postseason lists)
--   'list_nfl'   TUDDY
--   'list_nhl'   LAMP
-- One kind per sport on purpose: the (day, kind) claim IS the rule "one list
-- post a day max per sport"; which list went out is in the row's payload.
-- Everything else is widen_16's list, unchanged. Idempotent.
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
    'history_watch', 'longshots', 'nfl_longshots', 'nhl_longshots',
    'multi_club', 'nfl_multi_club', 'nhl_multi_club',
    'list_mlb', 'list_nfl', 'list_nhl'
  ));
