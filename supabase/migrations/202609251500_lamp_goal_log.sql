-- LAMP GOAL LOG — the NHL goal board's prediction of record.
--
-- 2026-09-25. The first LAMP board (lamp-goal-v1; definition in
-- claude/lamp-goal-board-v1-2026-09-25.md). Same job as MOONSHOT's por_log
-- and TUDDY's nfl_por_log, kept in Supabase rather than the bot repo's
-- data branch because (a) the site already writes its public record here
-- (homer_feed_posts, nfl_td_feed) from Vercel crons, and (b) v1's compute is
-- a rank average over feed fields -- no bot needed until a model needs a
-- nightly feature archive it cannot rebuild from the feed.
--
-- THE LOCK IS THE CLOCK. app/api/lamp/tick upserts a game's rows every ten
-- minutes from 100 minutes before puck drop and REFUSES to write once
-- now >= start_utc, so the last write is the lock -- leak-free by
-- construction (the rule MOONSHOT moved to on 09-14). locked_at is the
-- write time. Grading fills dressed/goals/hit once the game is final and
-- never touches the scoring columns.
--
-- One row per (game, player, model_version). A new model version writes
-- new rows; old rows keep theirs, so the record of v1 survives v2.

create table if not exists public.lamp_goal_log (
  game_id        bigint      not null,
  player_id      integer     not null,
  model_version  text        not null,
  game_date      date        not null,            -- the league's ET calendar day
  season         integer     not null,            -- 20262027
  game_type      smallint    not null,            -- 1 pre / 2 regular / 3 playoffs
  start_utc      timestamptz not null,
  team           text        not null,
  opp            text        not null,
  home           boolean     not null,
  name           text        not null,
  pos            text,
  -- the scoring (what the definition calls legs, pct, score, rank, status)
  legs           jsonb,                            -- { shotsPg, goalsPg, toi, gpPooled, gpCur, gpPrev, prevWeight }
  pct            jsonb,                            -- { shotsPg, goalsPg, toi } percentile ranks that night
  score          smallint,                         -- 0-100, null when not scored
  rank_in_game   smallint,
  status         text        not null,             -- 'called' | 'board' | 'off'
  reason         text,                             -- why 'off' (printed, never hidden)
  context        jsonb,                            -- { oppGaPg, b2b, lineupKnown, stale, ... } shown, not scored
  locked_at      timestamptz not null default now(),
  -- the grade (filled once, after the final)
  dressed        boolean,
  goals          smallint,
  hit            boolean,
  graded_at      timestamptz,
  primary key (game_id, player_id, model_version)
);

create index if not exists lamp_goal_log_date_idx on public.lamp_goal_log (game_date, model_version);
create index if not exists lamp_goal_log_player_idx on public.lamp_goal_log (player_id, model_version);

-- One row per game: when it locked, whether lineups were known at lock,
-- when it was graded. The tick reads this to know what still needs doing.
create table if not exists public.lamp_goal_games (
  game_id        bigint      not null,
  model_version  text        not null,
  game_date      date        not null,
  season         integer     not null,
  game_type      smallint    not null,
  start_utc      timestamptz not null,
  away           text        not null,
  home           text        not null,
  snapshots      smallint    not null default 0,   -- how many pregame writes happened
  lineup_known   boolean     not null default false,
  locked_at      timestamptz,                      -- the last pregame write
  state          text,                              -- last seen gameState
  graded_at      timestamptz,
  primary key (game_id, model_version)
);

-- Same access shape as nfl_td_feed: the site reads the record with the
-- anon key (it is the public record), only the service role writes.
alter table public.lamp_goal_log enable row level security;
alter table public.lamp_goal_games enable row level security;
drop policy if exists "lamp_goal_log_read" on public.lamp_goal_log;
create policy "lamp_goal_log_read" on public.lamp_goal_log for select using (true);
drop policy if exists "lamp_goal_games_read" on public.lamp_goal_games;
create policy "lamp_goal_games_read" on public.lamp_goal_games for select using (true);
