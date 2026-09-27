-- LAMP GOAL FEED — one row per NHL goal, seen live (2026-09-28,
-- .claude-notes/BATCH-LAMP-GOALS-PLAN.md step 0).
--
-- Hockey's homer_feed. app/api/lamp/goals/tick (Vercel cron, every minute
-- through the NHL's game windows) reads the league's /score/<date> and writes
-- each goal the first time it sees it. Same rules as homer_feed:
--   · FROZEN AT FIRST SIGHT. The goal's facts and its label are written once
--     (insert ... on conflict do nothing) and never rewritten. Only the
--     bookkeeping columns change afterwards: confirmed_at, overturned_at,
--     x_post_id, push_sent.
--   · THE LABEL COMES FROM THE LOCK. status / rank_in_game / lamp_score are
--     copied from lamp_goal_log (the pregame lock, current MODEL_VERSION)
--     when the row is first written. A game that never locked has status
--     null, and then nothing anywhere says CALLED or NOT ON THE BOARD.
--   · day is the GAME's own date (the league's gameDate), never the clock.
--
-- HOCKEY HAS CHALLENGES. A goal can come off the board (offside, goalie
-- interference) or move to another scorer. confirmed_at is set when a read
-- at least 90 s after first_seen_at still has the goal; a read of a
-- consistent feed that no longer has it sets overturned_at. Nothing is
-- pushed or posted until confirmed_at, and never after overturned_at.
--
-- goal_n is the key, not a display count: his 1st, 2nd... row in this game.
-- A goal that replaces an overturned one of his gets the next number, so a
-- confirmed row can never be inherited by a different goal.
--
-- SERVICE ROLE ONLY (RLS on, no policies), like odds_snap and multi_games:
-- the site reads it through its own API routes. Idempotent: safe to run twice.

create table if not exists public.lamp_goal_feed (
  game_id        bigint      not null,
  player_id      integer     not null,
  goal_n         smallint    not null check (goal_n >= 1),
  day            date        not null,            -- the game's own date (gameDate)
  season         integer     not null,            -- 20262027
  game_type      smallint    not null,            -- 1 pre / 2 regular / 3 playoffs
  period         smallint,
  period_type    text,                            -- REG / OT (SO goals are never written)
  time_in_period text,                            -- "04:02", elapsed
  strength       text,                            -- ev / pp / sh
  empty_net      boolean     not null default false,
  team           text,
  opp            text,
  name           text,                            -- "Dakota Joshua"
  season_goals   smallint,                        -- goalsToDate at the time of the goal
  assists        jsonb,                           -- [{ id, name, assistsToDate }]
  score_after    text,                            -- "CAR 0 · TOR 1"
  clip_url       text,
  -- the label, from lamp_goal_log at the lock (null = the game never locked)
  status         text        check (status in ('called', 'board', 'off')),
  rank_in_game   smallint,
  lamp_score     smallint,
  model_version  text,
  -- bookkeeping (the only columns ever updated)
  first_seen_at  timestamptz not null default now(),
  confirmed_at   timestamptz,
  overturned_at  timestamptz,
  x_post_id      text,
  push_sent      boolean     not null default false,
  primary key (game_id, player_id, goal_n)
);

-- In case an earlier draft of this table exists without a later column.
alter table public.lamp_goal_feed add column if not exists clip_url      text;
alter table public.lamp_goal_feed add column if not exists model_version text;
alter table public.lamp_goal_feed add column if not exists confirmed_at  timestamptz;
alter table public.lamp_goal_feed add column if not exists overturned_at timestamptz;
alter table public.lamp_goal_feed add column if not exists x_post_id     text;
alter table public.lamp_goal_feed add column if not exists push_sent     boolean not null default false;

create index if not exists lamp_goal_feed_day_idx on public.lamp_goal_feed (day desc);

alter table public.lamp_goal_feed enable row level security;
revoke all on table public.lamp_goal_feed from anon, authenticated;
grant all on table public.lamp_goal_feed to service_role;

-- Probe (one row, rls = true, and 0 rows readable to anon):
--   select relname, relrowsecurity as rls from pg_class where relname = 'lamp_goal_feed';
--   select count(*) from public.lamp_goal_feed;
