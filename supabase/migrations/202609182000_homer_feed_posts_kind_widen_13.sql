-- Widen homer_feed_posts_kind_check for TUDDY's Sunday/Monday set
-- (2026-09-18, Donovan: "add more nfl tweets like the bot vs people and thinsg
-- like that"). Adds:
--   'nfl_board'      Sun  9am ET -- NFL TOUCHDOWN BOARD, one name per position
--   'nfl_botpoll'    Sun 10am ET -- THE BOT VS THE PEOPLE, native X poll, with
--                                   TUDDY's own pick shown next to it
--   'nfl_community'  Sun 11am ET -- YOUR TOUCHDOWN CALL, open invitation
--   'nfl_results'    Mon  9am ET -- the Sunday board GRADED against nfl_td_feed
--
-- nfl_results is the one that matters. CALLED IT's stated proposition is
-- "every call graded in public -- the misses too," and until now that was an
-- MLB-only promise: TUDDY made touchdown calls and never said how they went.
--
-- Same constraint and the same silent-no-op failure mode as the twelve
-- kind-widen migrations before it. Note what that cost this week: widen_11 was
-- pushed before it was run, so nfl_redzone / nfl_goalline / nfl_tdhistory /
-- nfl_whyboard all failed Postgres 23514 at their Wed/Thu/Fri slots and posted
-- nothing. Run this one BEFORE the push.
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
    'nfl_board', 'nfl_botpoll', 'nfl_community', 'nfl_results'
  ));
