-- LAMP · THE CLUB-GAME LINE (lamp-team-v1, 2026-10-08). NOT RUN: Donovan runs it.
--
-- One row per club per game: goals for / against, the shots on goal it took and gave up and the xG on
-- them (lib/nhl/xg.js, lamp-xg-v1), empty-net goals, and the goalies in its net with what each faced.
-- The slate's game projection (lib/nhl/teamProj.js) reads a club's last 82 regular-season rows before the
-- game's own date: expected shot volume x shot quality x the opposing defence x the opposing goalie.
-- Written postgame by /api/lamp/tick's grade step, right after the game's shots (lib/nhl/teamXg.js builds
-- the row from lamp_shots rows, so there is one way to build it), and backfilled once from lamp_shots by
-- scripts/backfill-lamp-team-xg.mjs. Same values on a rerun (upsert on the key). Derived data, not a model
-- record: nothing pregame is ever written here.
--
-- Until this runs the site falls back to a plain rate (goals a game and goals allowed, from the standings)
-- and says so on the dial; nothing breaks.
--
-- SERVICE ROLE ONLY: RLS on, no policies, no anon/authenticated grants. Idempotent: safe to run twice.

create table if not exists public.lamp_team_game_xg (
  game_id     bigint           not null,
  team        text             not null,                 -- this club
  opp         text             not null,
  game_date   date             not null,                 -- the game's own date (ET)
  season      integer          not null,
  game_type   smallint         not null,                 -- 1 pre, 2 regular, 3 playoffs
  gf          smallint         not null,                 -- goals for, empty-net goals included
  ga          smallint         not null,
  sog         smallint         not null,                 -- shots on goal at a goalie (empty net left off)
  xg          double precision not null,                 -- lamp-xg-v1 summed over those shots
  sog_a       smallint         not null,                 -- the same, shots it allowed
  xg_a        double precision not null,
  en          smallint         not null default 0,       -- empty-net goals this club scored
  goalies     jsonb            not null default '{}'::jsonb,  -- this club's goalies: { "<goalie_id>": [shots faced, goals allowed, xG faced] }
  xg_version  text             not null default 'lamp-xg-v1',
  written_at  timestamptz      not null default now(),
  primary key (game_id, team)
);
create index if not exists lamp_team_game_xg_team_idx on public.lamp_team_game_xg (team, game_type, game_date desc);

alter table public.lamp_team_game_xg enable row level security;
revoke all on table public.lamp_team_game_xg from anon, authenticated;
grant all on table public.lamp_team_game_xg to service_role;

-- Probe: select relname, relrowsecurity as rls from pg_class where relname = 'lamp_team_game_xg';
-- After the backfill: select count(*), min(game_date), max(game_date) from public.lamp_team_game_xg;   -- ~2 rows a game, ~2,600 for a regular season
