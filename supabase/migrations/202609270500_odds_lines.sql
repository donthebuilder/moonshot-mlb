-- ODDS: EVERY MARKET WE SCORE, AT LOCK (2026-09-27). lib/odds/lines.js.
-- The same SGO event object /api/odds/tick already buys for the lock snapshot
-- carries every market; this keeps the ones our products score (MLB hits,
-- H+R+RBI, total bases, steals, pitcher K; NFL receiving/rushing/passing yards,
-- receptions, rush attempts, kicking points), one compact row per player per
-- market -- consensus, fair, opening and best-book line + price. No new API
-- cost. Insert-only; nothing written at or after the start.
-- SERVICE ROLE ONLY (RLS on, no policies), like odds_snap. Idempotent.

create table if not exists public.odds_lines (
  sport          text        not null,
  event_id       text        not null,
  game_date      date        not null,
  starts_at      timestamptz not null,
  snap           text        not null check (snap in ('lock', 'close')),
  taken_at       timestamptz not null,
  market         text        not null,             -- our word: hits, hrr, tb, sb, k, rec_yds, rec, ...
  stat           text        not null,             -- the feed's statID
  bet            text        not null check (bet in ('yn', 'ou')),
  side           text        not null check (side in ('yes', 'over')),
  odd_id         text        not null,
  sgo_player_id  text        not null,
  player_name    text,
  team           text,
  our_player_id  text,                             -- null = unmatched, never guessed
  line           numeric,                          -- consensus (null on yes/no)
  odds           integer,                          -- consensus American price
  fair_line      numeric,
  fair_odds      integer,
  open_line      numeric,
  open_odds      integer,
  best_line      numeric,
  best_odds      integer,
  best_book      text,
  books          integer     not null,
  primary key (event_id, odd_id, snap),
  check (taken_at < starts_at)
);
create index if not exists odds_lines_date_idx   on public.odds_lines (sport, game_date, market);
create index if not exists odds_lines_player_idx on public.odds_lines (our_player_id) where our_player_id is not null;

alter table public.odds_lines enable row level security;
revoke all on table public.odds_lines from anon, authenticated;
grant all on table public.odds_lines to service_role;

-- Probe (one row, rls = true):
--   select relname, relrowsecurity as rls from pg_class where relname = 'odds_lines';
