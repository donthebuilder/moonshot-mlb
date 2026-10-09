-- NFL PRE-GAME TOUCHDOWN SNAPSHOTS (2026-10-08, fix10-nfl-1008).
-- One row per game x model_version, written once BEFORE kickoff by the NFL tick
-- (lib/nfl/gameSnapshot.js, ignore-duplicates: never rewritten). Holds the team
-- model's expected touchdowns next to the old players' xTD sum so the two can be
-- compared with what happened (scripts/nfl-td-compare.mjs). The writer degrades
-- gracefully while this table is missing. SERVICE ROLE ONLY (RLS on, no policies).
-- Idempotent: safe to run twice.
create table if not exists public.nfl_game_td_snapshots (
  game_id              text        not null,
  season               integer     not null,
  week                 integer     not null,
  home                 text        not null,
  away                 text        not null,
  kickoff              timestamptz not null,
  team_model_total     double precision not null,
  team_model_home      double precision not null,
  team_model_away      double precision not null,
  players_xtd_sum_home double precision not null,
  players_xtd_sum_away double precision not null,
  model_version        text        not null,
  stamped_at           timestamptz not null default now(),
  primary key (game_id, model_version),
  check (stamped_at < kickoff)
);
create index if not exists nfl_game_td_snapshots_week_idx on public.nfl_game_td_snapshots (season, week);
alter table public.nfl_game_td_snapshots enable row level security;
