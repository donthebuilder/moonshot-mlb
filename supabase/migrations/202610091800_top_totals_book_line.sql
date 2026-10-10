-- TOP TOTALS BOOK LINE (2026-10-09). The line a call is graded against becomes the sportsbooks' consensus GAME TOTAL
-- where one is listed and the unit matches what we count: NHL (total goals) and NBA (total points) ONLY.
-- MLB (books: runs, we count home runs) and NFL (books: points, we count touchdowns) stay on the projection.
--
--  1. public.odds_game_totals  one compact row per game per snapshot (list / lock), written by /api/odds/tick from the
--     SGO event it already fetches (points-all-game-ou-over/under, bookOverUnder). No new SGO calls.
--  2. public.top_totals_calls  + book_line, book_taken_at, book_books, book_event_id. line_source 'book' means
--     line = book_line (the check below). Rows locked before this are untouched (line_source 'projection').
--  3. the guard trigger now also freezes the four book columns at the lock (a locked call is never rewritten).
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Idempotent: safe to run twice. PROBES at the bottom.
-- (The code degrades without it: no odds_game_totals = every call keeps the projection line; missing book columns =
-- the lock falls back to projection rows rather than not locking.)

create table if not exists public.odds_game_totals (
  sport       text        not null check (sport in ('nhl','nba')),
  event_id    text        not null,
  game_date   date        not null,
  starts_at   timestamptz not null,
  snap        text        not null check (snap in ('list','lock','close')),
  taken_at    timestamptz not null,
  away        text,                                  -- SGO's short names (NJ, LA, GSW ...), compared via lib/odds/gameTotal.js bookTeamKey
  home        text,
  line        numeric     not null check (line > 0), -- consensus total (SGO bookOverUnder), quoted by >= 1 live book on both sides
  over_odds   integer,
  under_odds  integer,
  fair_line   numeric,
  open_line   numeric,
  books       integer     not null,
  primary key (event_id, snap),
  check (taken_at < starts_at)
);
create index if not exists odds_game_totals_date_idx on public.odds_game_totals (sport, game_date);

alter table public.odds_game_totals enable row level security;
revoke all on table public.odds_game_totals from anon, authenticated;
grant all on table public.odds_game_totals to service_role;

alter table public.top_totals_calls add column if not exists book_line      double precision;
alter table public.top_totals_calls add column if not exists book_taken_at  timestamptz;
alter table public.top_totals_calls add column if not exists book_books     integer;
alter table public.top_totals_calls add column if not exists book_event_id  text;

alter table public.top_totals_calls drop constraint if exists top_totals_calls_book_line_check;
alter table public.top_totals_calls add constraint top_totals_calls_book_line_check
  check (line_source <> 'book' or (book_line is not null and line = book_line and sport in ('nhl','nba')));

create or replace function public.top_totals_calls_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if now() >= new.start_at then
      raise exception 'top_totals_calls: % % starts at % -- nothing is locked at or after the start', new.sport, new.game_id, new.start_at;
    end if;
    if new.book_taken_at is not null and new.book_taken_at >= new.start_at then
      raise exception 'top_totals_calls: the book total was read at or after the start';
    end if;
    new.locked_at := now();
    return new;
  end if;
  -- UPDATE: the lock columns are fixed, the result is written once
  if (new.sport, new.game_id, new.model_version, new.slate_key, new.game_date, new.start_at, new.away, new.home, new.unit,
      new.projected_total, new.line, new.line_source, new.rank, new.field_size, new.called, new.locked_at,
      new.book_line, new.book_taken_at, new.book_books, new.book_event_id)
     is distinct from
     (old.sport, old.game_id, old.model_version, old.slate_key, old.game_date, old.start_at, old.away, old.home, old.unit,
      old.projected_total, old.line, old.line_source, old.rank, old.field_size, old.called, old.locked_at,
      old.book_line, old.book_taken_at, old.book_books, old.book_event_id) then
    raise exception 'top_totals_calls: a locked call is never rewritten (new model = new model_version)';
  end if;
  if old.result is not null then
    raise exception 'top_totals_calls: a graded call is never regraded';
  end if;
  return new;
end $$;
-- (the trigger top_totals_calls_guard from 202610091600 already points at this function)

-- PROBES (run after, one at a time):
--   select count(*) from public.odds_game_totals;                                   -- table exists (0 until the next odds tick list)
--   select column_name from information_schema.columns where table_name = 'top_totals_calls' and column_name like 'book_%';  -- 4 rows
--   insert into public.top_totals_calls (sport, game_id, model_version, slate_key, game_date, start_at, away, home, projected_total, line, line_source, book_line, rank, field_size, called)
--     values ('mlb', 'PROBE', 'probe', '2999-01-01', '2999-01-01', '2999-01-01T00:00:00Z', 'AAA', 'BBB', 7.1, 6.5, 'book', 6.5, 1, 1, false);   -- expect ERROR (MLB never takes a book line)
--   insert into public.top_totals_calls (sport, game_id, model_version, slate_key, game_date, start_at, away, home, projected_total, line, line_source, book_line, rank, field_size, called)
--     values ('nhl', 'PROBE', 'probe', '2999-01-01', '2999-01-01', '2999-01-01T00:00:00Z', 'AAA', 'BBB', 7.1, 6.5, 'book', 6.5, 1, 1, false);   -- expect INSERT 0 1
--   update public.top_totals_calls set book_line = 5.5, line = 5.5 where model_version = 'probe';                                              -- expect ERROR (never rewritten)
--   delete from public.top_totals_calls where model_version = 'probe';                                                                          -- expect DELETE 1
