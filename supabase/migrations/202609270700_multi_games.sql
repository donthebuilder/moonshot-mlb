-- THE 2+ CLUB, STEP 1 (2026-09-27, .claude-notes/BATCH-MULTI-PLAN.md).
-- Every 2+ game this season, all three sports, from the LEAGUE's box scores
-- (never only the games we happened to see), each wearing our label from the
-- one place that decides it (lib/callStatus.js, the graded files,
-- lamp_goal_log.status). A date with no graded record is 'pre' (BEFORE OUR
-- RECORD) -- never a guessed label.
--
--   kind  'HR'       MLB, 2+ home runs
--         'TD'       NFL, 2+ scoring touchdowns (rush + rec + return)
--         'PASS_TD'  NFL QBs, 2+ passing TDs -- its own kind, never added
--                    into 'TD'; a QB who also runs two in gets two rows
--         'G'        NHL, 2+ goals
--   odds  the price we saved before the start (odds_snap lock), else null
--
-- multi_gp: games played per player per season, so "good for it" is a rate,
-- not just a count.
--
-- SERVICE ROLE ONLY (RLS on, no policies), like the odds tables: the site
-- reads it through its own API routes. Idempotent: safe to run twice.

create table if not exists public.multi_games (
  sport        text        not null check (sport in ('mlb', 'nfl', 'nhl')),
  season       integer     not null,              -- MLB/NFL: the year; NHL: the start year (2026 = 2026-27)
  day          date        not null,              -- the game's own date
  game_id      text        not null,
  player_id    text        not null,              -- MLBAM / gsis / NHL id
  name         text,
  team         text,
  opp          text,
  n            integer     not null check (n >= 2),
  kind         text        not null check (kind in ('HR', 'TD', 'PASS_TD', 'G')),
  detail       jsonb,                             -- MLB distances/innings; NFL rush/rec/return split; NHL PP/EV/EN
  status       text        not null check (status in ('called', 'board', 'off', 'pre')),
  board_rank   integer,
  score        numeric,
  odds         integer,
  seen_at      timestamptz not null default now(),
  primary key (sport, game_id, player_id, kind)
);
create index if not exists multi_games_season_idx on public.multi_games (sport, season, kind);
create index if not exists multi_games_player_idx on public.multi_games (sport, player_id);
create index if not exists multi_games_day_idx    on public.multi_games (sport, day desc);

create table if not exists public.multi_gp (
  sport       text        not null check (sport in ('mlb', 'nfl', 'nhl')),
  season      integer     not null,
  player_id   text        not null,
  name        text,
  team        text,
  gp          integer     not null check (gp >= 0),   -- games he played
  starts      integer,                                -- NFL QBs: starts (the QB table's denominator)
  updated_at  timestamptz not null default now(),
  primary key (sport, season, player_id)
);

alter table public.multi_games enable row level security;
alter table public.multi_gp    enable row level security;
revoke all on table public.multi_games from anon, authenticated;
revoke all on table public.multi_gp    from anon, authenticated;
grant all on table public.multi_games to service_role;
grant all on table public.multi_gp    to service_role;

-- Probe (two rows, both rls = true):
--   select relname, relrowsecurity as rls from pg_class where relname in ('multi_games', 'multi_gp');
