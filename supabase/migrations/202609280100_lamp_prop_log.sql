-- LAMP PROP LOG — the prediction of record for LAMP's v2 markets
-- (2026-09-27, BATCH-LAMP-V2-MODELS-PLAN step 1).
--
-- One table for every new market (SOG first, then PTS, AST), shaped like
-- lamp_goal_log with a `market` column. lamp_goal_log stays exactly as it is.
-- Definitions: docs/lamp/lamp-<market>-v1-*.md (lamp-sog-v1 is the first).
--
-- THE LOCK IS THE CLOCK, same as lamp_goal_log: app/api/lamp/tick upserts a
-- game's rows every ten minutes from 100 minutes before puck drop and never
-- writes once now >= start_utc, so the last write is the lock. The grade
-- fills dressed / value / hit once, after the final, and never touches the
-- scoring columns. A new model is a new model_version with new rows.
--
-- Same access as lamp_goal_log: the public record, readable with the anon
-- key; only the service role writes. Idempotent: safe to run twice.

create table if not exists public.lamp_prop_log (
  game_id        bigint      not null,
  player_id      integer     not null,
  market         text        not null check (market in ('SOG', 'PTS', 'AST')),
  model_version  text        not null,            -- lamp-sog-v1 ...
  game_date      date        not null,            -- the league's ET calendar day
  season         integer     not null,            -- 20262027
  game_type      smallint    not null,            -- 1 pre / 2 regular / 3 playoffs
  start_utc      timestamptz not null,
  team           text        not null,
  opp            text        not null,
  home           boolean     not null,
  name           text        not null,
  pos            text,
  bar            smallint    not null,            -- 3 for SOG, 1 for PTS / AST
  -- the scoring
  legs           jsonb,                            -- the market's legs, e.g. { shotsPg, toi, oppSaPg, gpPooled, ... }
  pct            jsonb,                            -- each leg's percentile rank that night
  score          smallint,                         -- 0-100, null when not scored
  rank_in_game   smallint,
  status         text        not null check (status in ('called', 'board', 'off')),
  reason         text,                             -- why 'off' (printed, never hidden)
  context        jsonb,                            -- shown, not scored
  locked_at      timestamptz not null default now(),
  -- the grade (filled once, after the final)
  dressed        boolean,
  value          smallint,                         -- his sog / points / assists in the game
  hit            boolean,                          -- value >= bar; null when void or ungraded
  graded_at      timestamptz,
  primary key (game_id, player_id, market, model_version)
);

create index if not exists lamp_prop_log_date_idx on public.lamp_prop_log (game_date, market, model_version);
create index if not exists lamp_prop_log_player_idx on public.lamp_prop_log (player_id, market, model_version);

alter table public.lamp_prop_log enable row level security;
drop policy if exists "lamp_prop_log_read" on public.lamp_prop_log;
create policy "lamp_prop_log_read" on public.lamp_prop_log for select using (true);
grant select on table public.lamp_prop_log to anon, authenticated;
grant all on table public.lamp_prop_log to service_role;

-- Probe (one row, rls = true):
--   select relname, relrowsecurity as rls from pg_class where relname = 'lamp_prop_log';
--   select count(*) from public.lamp_prop_log;
