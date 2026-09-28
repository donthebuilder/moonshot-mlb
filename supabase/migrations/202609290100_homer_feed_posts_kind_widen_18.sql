-- Widen homer_feed_posts_kind_check (2026-09-28, X-POSTSEASON-POSTING-PLAN
-- steps 3/6/7). Adds THE CALL, one post per MLB postseason game, claimed as
-- 'call_<game_pk>' (lib/dash/gameCall.js, homers/tick). Without this every
-- claim is refused (Postgres 23514) and no per-game post ever goes out --
-- the same silent no-op as every widen before it.
-- One pattern instead of one kind per game: game_pk is MLB's numeric id.
-- Everything else is widen_17's list, unchanged. Idempotent.
-- RUN BEFORE the x-postseason code ships.
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
  ) or kind ~ '^call_[0-9]+$');

-- Probe (should print a definition ending in  OR (kind ~ '^call_[0-9]+$'::text) ):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
