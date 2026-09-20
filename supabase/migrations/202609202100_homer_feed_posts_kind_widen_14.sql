-- Widen homer_feed_posts_kind_check for TUDDY's PLAYER SPOTLIGHT
-- (2026-09-20, Donovan: "player spot lights just like mlb list do one for this
-- week"). Adds ONE kind:
--   'nfl_spotlight'  Tue 11am ET -- one player, the week just played, his line
--                                   stacked, the way MOONSHOT's HOT STRETCH
--                                   does it for a hitter
--
-- TUESDAY because that is when the week is actually finished -- Monday Night
-- Football is in the box score by then, and nfl_fantasy_stats.json reports how
-- many of the week's games are `completed` so the post can say WEEK N honestly
-- instead of spotlighting a Thursday game as if it were the whole week. It
-- also fills the last empty day in TUDDY's calendar.
--
-- Same silent-no-op failure as the thirteen kind-widen migrations before it.
-- Run it BEFORE the push. (This one is not urgent in the same way: the first
-- Tuesday slot is three days out.)
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
    'nfl_spotlight'
  ));
