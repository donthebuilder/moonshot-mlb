-- LAMP'S BOX SCORES, ONE ROW PER PLAYER PER GAME (2026-10-25, Donovan: Trending "for all the sports" + LAMP's WITHOUT split).
-- lamp_shots holds shooters only (no ice time, nobody who did not shoot), so LAMP could not say "his last 10 games" for points /
-- assists / shots on goal, nor who missed a game. This keeps the NHL's own box score (api-web.nhle.com gamecenter/{id}/boxscore),
-- dressed players with ice time only, written once at grade time by /api/lamp/tick (lib/nhl/box.js) and backfilled by
-- scripts/backfill-lamp-box.mjs (2025-26 and this season). ~45k rows a season.
-- Additive and idempotent. RLS on with no public policy: the service role (the tick, the routes) reads it.
-- PROBE: select season, count(*), count(distinct game_id) from public.lamp_box group by season order by season;
create table if not exists public.lamp_box (
  game_id      bigint      not null,
  player_id    bigint      not null,
  game_date    date        not null,              -- the game's own date (ET)
  season       integer     not null,              -- e.g. 20252026
  game_type    smallint    not null,              -- 2 regular, 3 playoffs
  team         text        not null,
  opp          text        not null,
  home         boolean     not null,
  name         text        not null,
  pos          text,                              -- C / L / R / D / G as the box gives it
  sweater      smallint,
  toi_s        integer,                           -- ice time, seconds
  goals        smallint,
  assists      smallint,
  points       smallint,
  sog          smallint,
  pp_goals     smallint,
  hits         smallint,
  blocks       smallint,
  pim          smallint,
  shifts       smallint,
  plus_minus   smallint,
  saves        smallint,                          -- goalies only
  shots_against smallint,
  goals_against smallint,
  primary key (game_id, player_id)
);
create index if not exists lamp_box_player_idx on public.lamp_box (player_id, season);
create index if not exists lamp_box_opp_idx on public.lamp_box (season, opp, pos);
alter table public.lamp_box enable row level security;
revoke all on public.lamp_box from anon, authenticated;
