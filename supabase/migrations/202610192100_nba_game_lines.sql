-- BUCKETS GAME LINES (2026-10-19, Donovan: "Build the info-only 'our line': capture SGO moneyline + spread from the object
-- we already buy (odds_game_lines, SQL first), lock rows before tip, show 'Our line / Book' on the BUCKETS game page.
-- No CALLED, no %.")
--
--  1. public.odds_game_lines  one compact row per game per odds snapshot (list / lock / close), written by /api/odds/tick
--     from the SGO event it already fetches (points-home-game-sp-home / -ml-home and the away sides). No new SGO calls.
--  2. public.nba_line_calls   OUR LINE for one game, locked once before tip by /api/buckets/tick (lib/nba/gameLinesStore.js):
--     the model's home margin, what it read (who is out, rest), and the book's line in hand at the lock. INFO ONLY: it is
--     not a call and has no record on the site. win_share_home is LOGGED for calibration and never printed
--     (scripts/check-no-printed-probability.mjs). The final margin is written once after the final.
--
-- GUARDS IN THE DATABASE (the code holds them too), as top_totals_calls:
--   * INSERT is refused at or after start_at, by the database clock; locked_at is stamped by the database.
--   * UPDATE can never change a lock column, and a graded row (final_margin not null) can never change again.
--   * a new model is a new model_version, with new rows.
-- RLS: both tables service-only (no anon / authenticated access). The site reads them on the server.
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Additive and idempotent: safe to run twice. PROBES at the bottom.
-- (The code degrades without it: a failed write is logged and the page shows our line with no book.)

create table if not exists public.odds_game_lines (
  sport             text        not null check (sport in ('nba')),
  event_id          text        not null,
  game_date         date        not null,              -- the game's own date (ET), never the wall clock
  starts_at         timestamptz not null,
  snap              text        not null check (snap in ('list','lock','close')),
  taken_at          timestamptz not null,
  away              text,                              -- SGO's short names, compared via lib/odds/gameTotal.js bookTeamKey
  home              text,
  spread_home       numeric,                           -- SGO consensus bookSpread from the home side (-5.5 = home gives 5.5)
  spread_home_odds  integer,
  spread_away_odds  integer,
  spread_books      integer,                           -- live books quoting exactly that number on both sides
  open_spread_home  numeric,
  ml_home           integer,                           -- consensus moneylines (American)
  ml_away           integer,
  ml_books          integer,
  open_ml_home      integer,
  open_ml_away      integer,
  primary key (event_id, snap),
  check (taken_at < starts_at),
  check (spread_home is not null or ml_home is not null)
);
create index if not exists odds_game_lines_date_idx on public.odds_game_lines (sport, game_date);

alter table public.odds_game_lines enable row level security;
revoke all on table public.odds_game_lines from anon, authenticated;
grant all on table public.odds_game_lines to service_role;

create table if not exists public.nba_line_calls (
  game_id           text        not null,              -- ESPN's game id (the site's)
  model_version     text        not null,
  game_date         date        not null,
  start_at          timestamptz not null,
  season_type       integer,
  away              text        not null,
  home              text        not null,
  our_margin_home   double precision not null,         -- the model's home points minus road points
  win_share_home    double precision,                  -- LOGGED ONLY, never printed
  basis             text,                              -- 'last season' | 'part last season' | 'this season'
  inputs            jsonb,                             -- ratings, rest, who is out (names, missing value), injury report time
  book_spread_home  numeric,
  book_ml_home      integer,
  book_ml_away      integer,
  book_taken_at     timestamptz,
  book_event_id     text,
  locked_at         timestamptz not null default now(),
  final_margin_home integer,
  ats               text        check (ats in ('home','away','push')),   -- vs book_spread_home, null without a book line
  graded_at         timestamptz,
  primary key (game_id, model_version),
  check (locked_at < start_at)
);
create index if not exists nba_line_calls_date_idx on public.nba_line_calls (game_date);
create index if not exists nba_line_calls_open_idx on public.nba_line_calls (start_at) where final_margin_home is null;

create or replace function public.nba_line_calls_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if now() >= new.start_at then
      raise exception 'nba_line_calls: % starts at % -- nothing is locked at or after tip', new.game_id, new.start_at;
    end if;
    if new.book_taken_at is not null and new.book_taken_at >= new.start_at then
      raise exception 'nba_line_calls: the book line was read at or after tip';
    end if;
    new.locked_at := now();
    return new;
  end if;
  if (new.game_id, new.model_version, new.game_date, new.start_at, new.season_type, new.away, new.home, new.our_margin_home,
      new.win_share_home, new.basis, new.inputs, new.book_spread_home, new.book_ml_home, new.book_ml_away, new.book_taken_at,
      new.book_event_id, new.locked_at)
     is distinct from
     (old.game_id, old.model_version, old.game_date, old.start_at, old.season_type, old.away, old.home, old.our_margin_home,
      old.win_share_home, old.basis, old.inputs, old.book_spread_home, old.book_ml_home, old.book_ml_away, old.book_taken_at,
      old.book_event_id, old.locked_at) then
    raise exception 'nba_line_calls: a locked line is never rewritten (new model = new model_version)';
  end if;
  if old.final_margin_home is not null then
    raise exception 'nba_line_calls: a graded line is never regraded';
  end if;
  return new;
end $$;

drop trigger if exists nba_line_calls_guard on public.nba_line_calls;
create trigger nba_line_calls_guard before insert or update on public.nba_line_calls
  for each row execute function public.nba_line_calls_guard();

alter table public.nba_line_calls enable row level security;
revoke all on table public.nba_line_calls from anon, authenticated;
grant all on table public.nba_line_calls to service_role;

-- PROBES (run after, one at a time):
--   select count(*) from public.odds_game_lines;                                -- expect 0 (table exists)
--   select count(*) from public.nba_line_calls;                                 -- expect 0
--   insert into public.nba_line_calls (game_id, model_version, game_date, start_at, away, home, our_margin_home)
--     values ('PROBE', 'probe', '1970-01-01', '1970-01-01T00:00:00Z', 'AAA', 'BBB', 1);      -- expect ERROR (tip in the past)
--   insert into public.nba_line_calls (game_id, model_version, game_date, start_at, away, home, our_margin_home)
--     values ('PROBE', 'probe', '2999-01-01', '2999-01-01T00:00:00Z', 'AAA', 'BBB', 1);      -- expect INSERT 0 1
--   update public.nba_line_calls set our_margin_home = 2 where model_version = 'probe';           -- expect ERROR (never rewritten)
--   update public.nba_line_calls set final_margin_home = 3, graded_at = now() where model_version = 'probe';   -- expect UPDATE 1
--   update public.nba_line_calls set final_margin_home = 4 where model_version = 'probe';        -- expect ERROR (graded once)
--   delete from public.nba_line_calls where model_version = 'probe';                             -- expect DELETE 1
