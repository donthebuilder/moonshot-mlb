-- BOARD RANK SNAPSHOTS (2026-10-10): the previous ordering of each ranking board, so every visitor sees the same
-- up / down arrows ("places moved since the last update") beside a player's rank.
--
-- Information only. This table holds an ordering (player id -> rank) and a time. It holds no score, no model number,
-- no call and no status, and nothing here feeds any of them. A row is written once, when a board shows an ordering the
-- table has not seen for that sport, board and game date, and is never rewritten. The server route that writes it
-- (app/api/rank-snapshots, and the board routes of LAMP and BUCKETS) keeps the newest 6 orderings per board per day and
-- deletes the older ones in the same write.
--
-- Public read (the arrows are public), service-role writes only. Idempotent: safe to run twice.

create table if not exists public.board_rank_snapshots (
  sport         text        not null,
  board         text        not null,
  game_date     date        not null,
  source_stamp  text        not null,
  ranks         jsonb       not null,
  taken_at      timestamptz not null default now(),
  primary key (sport, board, game_date, source_stamp)
);

create index if not exists board_rank_snapshots_recent
  on public.board_rank_snapshots (sport, board, game_date, taken_at desc);

alter table public.board_rank_snapshots enable row level security;

drop policy if exists board_rank_snapshots_read on public.board_rank_snapshots;
create policy board_rank_snapshots_read on public.board_rank_snapshots
  for select to anon, authenticated using (true);
