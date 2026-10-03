-- BOARD LOCK (2026-10-03, BATCH-MODEL-V2 M4 -- the value call, NFL).
-- A sport's whole pregame board for one game, frozen at the odds tick's LOCK
-- (50-70 min before kickoff), beside the lock prices odds_snap took at the
-- same instant: every rated player's score, board rank and CALLED / ON THE
-- BOARD / NOT ON THE BOARD (lib/callStatus.js, never re-derived), graded after
-- the final. TUDDY's weekly board is otherwise not archived, so this is what
-- the value call (lib/model/valueCall.js) is graded on -- shadow, /admin only.
-- model_version is in the key: a new model is new rows, never a rewrite.
-- Service role only (RLS on, no policies). Idempotent. The code writes
-- nothing and reads nothing until this table exists.
create table if not exists public.board_lock (
  sport          text        not null,                 -- nfl (mlb later)
  game_id        text        not null,                 -- the odds feed's event id (odds_snap.event_id)
  game_date      date        not null,
  player_id      text        not null,                 -- our id (gsis for NFL)
  model_id       text        not null,                 -- tuddy-td
  model_version  text        not null,                 -- tuddy-td-v1
  name           text,
  team           text,
  opp            text,
  pos            text,
  week           integer,                              -- NFL week (the grade's join to the game logs)
  score          numeric(6,1),
  board_rank     integer,                              -- rank on the whole week's board
  board_of       integer,
  status         text        not null check (status in ('called', 'board', 'off')),
  called_by      text,                                 -- the market of the designated pick (TD, GAME, REC_YDS...)
  source         text,                                 -- the slate file's built_at
  locked_at      timestamptz not null,
  result         text check (result in ('hit', 'miss', 'void')),
  actual         numeric(6,1),
  graded_at      timestamptz,
  primary key (sport, game_id, player_id, model_version)
);
create index if not exists board_lock_date_idx on public.board_lock (sport, game_date);
alter table public.board_lock enable row level security;
