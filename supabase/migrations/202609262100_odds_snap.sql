-- ODDS PIPELINE, STEP 1 (2026-09-26, .claude-notes/BATCH-ODDS-PLAN.md).
-- Every book's price on the players our boards care about, captured three
-- times per game by /api/odds/tick: 'list' (the day's first read), 'lock'
-- (50-70 min before start) and 'close' (5-15 min before start). Nothing is
-- written at or after starts_at, and rows are insert-only (the route never
-- updates a row). Nothing on the site reads these yet.
--
-- SERVICE ROLE ONLY: RLS on, no policies, and anon/authenticated have no
-- grants -- the cron holds the service key. Idempotent: safe to run twice.

create table if not exists public.odds_snap (
  sport            text        not null,             -- 'mlb' | 'nfl' | 'nhl'
  event_id         text        not null,             -- SportsGameOdds eventID
  game_date        date        not null,             -- the game's own date (ET)
  starts_at        timestamptz not null,
  snap             text        not null check (snap in ('list', 'lock', 'close')),
  taken_at         timestamptz not null,
  market           text        not null check (market in ('hr', 'td', 'goal')),
  odd_id           text        not null,             -- e.g. touchdowns-DEVON_ACHANE_1_NFL-game-yn-yes
  sgo_player_id    text        not null,
  player_name      text,
  team             text,                             -- the feed's short team code
  our_player_id    text,                             -- gsis / MLBAM / NHL id; null = unmatched, never guessed
  book             text        not null,
  odds             integer     not null,             -- American
  available        boolean     not null,
  book_updated_at  timestamptz,
  fair_odds        integer,                          -- the feed's no-vig market fair price
  open_odds        integer,                          -- the feed's opening line (market-wide)
  open_fair_odds   integer,
  primary key (event_id, odd_id, book, snap),
  check (taken_at < starts_at)
);
create index if not exists odds_snap_date_idx   on public.odds_snap (sport, game_date);
create index if not exists odds_snap_player_idx on public.odds_snap (our_player_id) where our_player_id is not null;

-- The day's event map: which games exist, when they start, and which
-- snapshots were already taken (so a game with no props yet is not paid for
-- twice). This is bookkeeping, not a price.
create table if not exists public.odds_events (
  event_id   text        primary key,
  sport      text        not null,
  game_date  date        not null,
  starts_at  timestamptz not null,
  away       text,
  home       text,
  listed_at  timestamptz not null,
  lock_at    timestamptz,
  close_at   timestamptz
);
create index if not exists odds_events_day_idx on public.odds_events (sport, game_date);
create index if not exists odds_events_start_idx on public.odds_events (starts_at);

alter table public.odds_snap   enable row level security;
alter table public.odds_events enable row level security;
revoke all on table public.odds_snap   from anon, authenticated;
revoke all on table public.odds_events from anon, authenticated;
grant all on table public.odds_snap   to service_role;
grant all on table public.odds_events to service_role;

-- Probe (should return two rows, both with rls = true):
--   select relname, relrowsecurity as rls from pg_class where relname in ('odds_snap','odds_events');
