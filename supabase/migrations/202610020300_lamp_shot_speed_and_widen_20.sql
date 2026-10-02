-- LAMP · THE HARDEST SHOT OF THE NIGHT (2026-10-02, BATCH-3D-V2 step 3).
--
-- 1) lamp_shot_speed: a MEASURED speed for a shot in lamp_shots. NHL EDGE
--    publishes speeds only for each player's ten hardest shots of the season
--    (skater-shot-speed-detail hardestShots); each carries its game, period and
--    clock, which find the exact row in lamp_shots (checked: Pastrnak 2025-26
--    #1, 93.06 mph = game 2025021224 P2 19:58 = event 816). Every other shot has
--    no published speed, so nothing else is ever written here. Service role only
--    (RLS on, no policies), like lamp_shots.
-- 2) homer_feed_posts_kind_check widen_20: adds 'nhlhardest', the night's post,
--    claimed once per game day like every other post. Everything else is
--    widen_19's list (the four members kinds included), so running THIS file
--    alone is enough even if widen_19 never ran; running both is also fine.
-- Idempotent. RUN BEFORE the hardest-shot post ships; the code skips the whole
-- step (no EDGE reads, no post) until this table exists.

create table if not exists public.lamp_shot_speed (
  game_id    bigint      not null,
  event_id   integer     not null,
  player_id  integer     not null,
  game_date  date        not null,
  season     integer     not null,
  mph        numeric(5,1) not null,
  source     text        not null default 'nhl-edge-hardest',   -- his ten hardest of the season
  seen_at    timestamptz not null default now(),
  primary key (game_id, event_id)
);
create index if not exists lamp_shot_speed_date_idx on public.lamp_shot_speed (game_date);
alter table public.lamp_shot_speed enable row level security;

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
    'list_mlb', 'list_nfl', 'list_nhl',
    'mlb_members_board', 'mlb_members_grade', 'nfl_members_board', 'nfl_members_grade',
    'nhlhardest'
  ) or kind ~ '^call_[0-9]+$');



-- PROBES (run after):
--   select to_regclass('public.lamp_shot_speed');                       -- expect lamp_shot_speed
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'homer_feed_posts_kind_check';                     -- expect ... 'nhlhardest' ... OR (kind ~ '^call_[0-9]+$'::text)
