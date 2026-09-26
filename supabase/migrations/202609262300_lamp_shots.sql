-- LAMP SHOT ARCHIVE (2026-09-26, .claude-notes/BATCH-LAMP-RESEARCH-PLAN.md
-- step 3). Every shot attempt from the league's play-by-play: shots on goal,
-- goals, misses and blocks, with where it came from. Written postgame by
-- /api/lamp/tick's grade step (the play-by-play it already reads for the
-- net) and by a one-off, throttled backfill of 2025-26. Pages never read
-- this table directly: they get per-player aggregates from a cached route.
--
-- Raw coordinates as the feed gives them (x -100..100, y -42.5..42.5); the
-- read side normalises every shot to attack the same net. Nothing here is a
-- model output and nothing is ever rewritten: a re-grade upserts the same
-- (game_id, event_id) rows with the same values.
--
-- SERVICE ROLE ONLY: RLS on, no policies, no anon/authenticated grants.
-- Idempotent: safe to run twice.

create table if not exists public.lamp_shots (
  game_id         bigint      not null,
  event_id        integer     not null,            -- plays[].eventId
  game_date       date        not null,            -- the game's own date (ET)
  season          integer     not null,            -- e.g. 20252026
  game_type       smallint    not null,            -- 1 pre, 2 regular, 3 playoffs
  period          smallint    not null,
  period_type     text,                            -- REG / OT / SO
  time_s          smallint,                        -- seconds into the period
  player_id       integer     not null,            -- the shooter (scorer on a goal)
  team            text        not null,            -- the shooter's club (from the game's roster)
  goalie_id       integer,                         -- goalieInNetId; null on an empty net or a block
  x               smallint,
  y               smallint,
  zone            text,                            -- zoneCode as given
  shot_type       text,                            -- wrist / slap / snap / backhand / tip-in / ...
  result          text        not null check (result in ('goal', 'sog', 'miss', 'block')),
  strength        text        check (strength in ('ev', 'pp', 'sh')),  -- from situationCode, shooter's side
  situation_code  text,                            -- the feed's four digits, kept as given
  written_at      timestamptz not null default now(),
  primary key (game_id, event_id)
);
create index if not exists lamp_shots_player_idx on public.lamp_shots (player_id, season, game_type);
create index if not exists lamp_shots_team_idx   on public.lamp_shots (team, season, game_type);
create index if not exists lamp_shots_date_idx   on public.lamp_shots (game_date);

alter table public.lamp_shots enable row level security;
revoke all on table public.lamp_shots from anon, authenticated;
grant all on table public.lamp_shots to service_role;

-- Probe: select relname, relrowsecurity as rls from pg_class where relname = 'lamp_shots';
