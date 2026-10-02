-- DASH LINE (2026-10-02, BATCH-DASH-LINE step 1; .claude-notes/DASH-LINE-DEFINITION.md).
-- Our own number for a player's stat, frozen at the odds tick's LOCK beside
-- the book's line, graded after the final. model_version is in the key: a new
-- model is new rows, never a rewrite. Service role only (RLS on, no policies).
-- Idempotent. The code writes nothing and shows nothing until this table exists.
create table if not exists public.dash_lines (
  sport          text        not null,                 -- nfl | nba
  game_id        text        not null,                 -- the odds feed's event id
  game_date      date        not null,
  player_id      text        not null,                 -- our id (gsis for NFL)
  player_name    text,
  team           text,
  opp            text,
  market         text        not null,                 -- rec | rec_yds | rush_yds | rush_att | pass_yds | kick_pts
  model_version  text        not null,                 -- dash-line-v1
  dash_line      numeric(6,1),                         -- null = no line (reason says why)
  book_line      numeric(6,1),
  book_odds      integer,
  lean           text check (lean in ('over', 'under', 'none')),
  reason         text,                                 -- why there is no line, or the factor note
  base           numeric(7,2),                         -- the weighted mean before the opponent factor
  opp_factor     numeric(5,3),
  games_used     integer,
  frozen_at      timestamptz not null,
  actual         numeric(6,1),
  graded_at      timestamptz,
  primary key (sport, game_id, player_id, market, model_version)
);
create index if not exists dash_lines_date_idx on public.dash_lines (sport, game_date);
alter table public.dash_lines enable row level security;
