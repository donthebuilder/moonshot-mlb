-- MOONSHOT FIRST HIT / FIRST HOMER: THE LOCK AND THE GRADE (2026-10-23, Donovan: "the first hit ... keep getting that together and it's
-- grading and all that"; known issue 70). moonshot-first-v1 (lib/mlb/firstModel.js) ranks every starter in his game for the first hit and the
-- first homer. lib/mlb/firstLock.js writes those ranks ONCE per game in the last 20 minutes before first pitch (never at or after it) and
-- grades them off opening_games (sport 'mlb') once the game is in. A rank, never a chance. Rows are never rewritten: a new model is a new
-- model_version with new rows.
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Additive and idempotent. PROBE at the bottom.

create table if not exists public.mlb_first_log (
  game_pk        text        not null,
  game_date      date        not null,              -- the game's own date
  model_version  text        not null,              -- moonshot-first-v1
  player_id      text        not null,
  name           text,
  team           text,
  bat_order      smallint,                          -- 1-9, the lineup the call was made from
  hit_rank       smallint,                          -- 1 = the game's top call for the first hit
  hr_rank        smallint,                          -- 1 = the game's top call for the first homer
  projected      boolean     not null default false, -- the lineup wasn't confirmed when it locked
  locked_at      timestamptz not null,
  first_hit      boolean,                           -- graded: he got the game's first hit
  first_hr       boolean,                           -- graded: he hit the game's first homer (false for all when nobody homered)
  graded_at      timestamptz,
  primary key (game_pk, model_version, player_id)
);
create index if not exists mlb_first_log_date on public.mlb_first_log (game_date);
alter table public.mlb_first_log enable row level security;   -- service role only (the site reads it through /api/mlb/openings)

-- PROBE: select count(*), count(distinct game_pk), min(game_date), max(game_date), count(graded_at) from public.mlb_first_log;
--        (right after it runs: 0 rows; after the next game locks: 18 rows for that game)
-- UNDO:  drop table public.mlb_first_log;
