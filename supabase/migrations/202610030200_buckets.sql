-- BUCKETS (NBA) B1, 2026-10-02 -- mirrors of the lamp_goal_* tables, the market
-- and model_version in every key (BUCKETS-DEFINITION.md: buckets-pts-v1,
-- -reb-v1, -ast-v1, -3pm-v1, -pra-v1, -first-v1). SERVICE-ONLY: no public read
-- policy (BUCKETS is admin-only until Donovan opens it). Idempotent.
create table if not exists public.buckets_log (
  game_id        text        not null,             -- ESPN event id
  player_id      text        not null,             -- ESPN athlete id
  market         text        not null,             -- pts | reb | ast | 3pm | pra | first_fg | first_pts
  model_version  text        not null,
  game_date      date        not null,             -- the game's own ET day
  season         integer     not null,             -- the schedule's season (2027 = 2026-27)
  season_type    smallint    not null,             -- 1 pre / 2 regular / 3 playoffs
  start_utc      timestamptz not null,
  team           text        not null,
  opp            text        not null,
  home           boolean     not null,
  name           text        not null,
  pos            text,
  starter        boolean,
  legs           jsonb,
  pct            jsonb,
  score          smallint,
  rank_in_game   smallint,
  status         text        not null check (status in ('called', 'board', 'off')),
  role           text,                              -- TOP | BUCKET | null
  reason         text,
  context        jsonb,
  locked_at      timestamptz not null default now(),
  played         boolean,
  minutes        smallint,
  actual         numeric(6,1),
  hit            boolean,
  void_reason    text,
  graded_at      timestamptz,
  primary key (game_id, player_id, market, model_version)
);
create index if not exists buckets_log_date_idx on public.buckets_log (game_date, market, model_version);

create table if not exists public.buckets_games (
  game_id        text        not null,
  model_version  text        not null,
  game_date      date        not null,
  season         integer     not null,
  season_type    smallint    not null,
  start_utc      timestamptz not null,
  away           text        not null,
  home           text        not null,
  snapshots      smallint    not null default 0,
  lineup_known   boolean     not null default false,
  locked_at      timestamptz,
  state          text,
  graded_at      timestamptz,
  primary key (game_id, model_version)
);

-- the 30 PIECE moment and the first basket, once per player per game per kind
create table if not exists public.buckets_feed (
  game_id        text        not null,
  player_id      text        not null,
  kind           text        not null,             -- 30_piece | first_fg | first_pts
  game_date      date        not null,
  name           text        not null,
  team           text        not null,
  opp            text,
  points         smallint,
  status         text,                              -- CALLED / ON THE BOARD / NOT ON THE BOARD at the moment
  seen_at        timestamptz not null default now(),
  x_post_id      text,
  discord_sent   boolean     not null default false,
  primary key (game_id, player_id, kind)
);

create table if not exists public.buckets_shots (
  game_id        text        not null,
  event_id       text        not null,
  game_date      date        not null,
  player_id      text        not null,
  team_id        text,
  x              smallint    not null,              -- feet, 0-49 across
  y              smallint    not null,              -- feet from the baseline
  shot_type      text,
  made           boolean     not null,
  points         smallint    not null,
  three          boolean     not null,
  distance       smallint,
  period         smallint,
  clock          text,
  primary key (game_id, event_id)
);
create index if not exists buckets_shots_player_idx on public.buckets_shots (player_id, game_date);

alter table public.buckets_log   enable row level security;
alter table public.buckets_games enable row level security;
alter table public.buckets_feed  enable row level security;
alter table public.buckets_shots enable row level security;
