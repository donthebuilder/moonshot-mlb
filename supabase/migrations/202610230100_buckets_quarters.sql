-- QUARTER SPLITS (2026-10-22, Donovan: "build quarter splits on the BUCKETS bars"). One row per player per period per game,
-- counted from ESPN's play-by-play at grade time (lib/nba/quarters.js quarterLines; app/api/buckets/tick writes it, and
-- scripts/backfill-nba-quarters.mjs fills past games). Read by /api/buckets/player for the Q1 / Q2 / Q3 / Q4 / 1H / 2H chips on
-- the bars. Periods 5+ are overtimes. Plain counts from finished games; nothing modelled.
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Additive and idempotent: safe to run twice. PROBE at the bottom.

create table if not exists public.buckets_quarters (
  game_id      text        not null,
  player_id    text        not null,
  period       smallint    not null,             -- 1-4, then 5+ = overtimes
  game_date    date        not null,             -- the game's own date
  season       integer,
  season_type  smallint,                         -- 2 regular, 3 post (ESPN's numbers)
  pts          smallint    not null default 0,
  reb          smallint    not null default 0,
  ast          smallint    not null default 0,
  tpm          smallint    not null default 0,
  tpa          smallint    not null default 0,
  source       text        not null default 'tick',  -- tick | backfill
  written_at   timestamptz not null default now(),
  primary key (game_id, player_id, period)
);

create index if not exists buckets_quarters_player_idx on public.buckets_quarters (player_id, game_date desc);

-- service role only, like buckets_box (RLS on, no policies)
alter table public.buckets_quarters enable row level security;

-- PROBE: select count(*), count(distinct game_id), min(game_date), max(game_date) from public.buckets_quarters;
