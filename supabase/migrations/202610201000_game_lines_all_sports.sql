-- GAME LINES, EVERY SPORT (2026-10-20, Donovan: "do this" -- the info-only "our line" beside the book for MLB, NFL and
-- NHL too, as BUCKETS has it).
--
--  1. public.odds_game_lines   takes all four sports (it was NBA only). The odds tick writes each league's spread +
--     moneyline from the SGO event it already buys (list + lock). No new SGO calls.
--  2. public.game_line_calls   OUR LINE for one game of any sport, locked once before the start. Same columns and the same
--     database guards as nba_line_calls (202610192100) plus `sport` in the key. BUCKETS moves onto it in the same change.
--     nba_line_calls stays (empty) until both PRs are on main, then is dropped by hand.
--     INFO ONLY: not a call, no record. win_share_home is LOGGED for calibration and never printed.
-- RLS: service-only, as before.
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Additive and idempotent: safe to run twice. PROBES at the bottom.

alter table public.odds_game_lines drop constraint if exists odds_game_lines_sport_check;
alter table public.odds_game_lines add constraint odds_game_lines_sport_check check (sport in ('mlb','nfl','nhl','nba'));

create table if not exists public.game_line_calls (
  sport             text        not null check (sport in ('mlb','nfl','nhl','nba')),
  game_id           text        not null,              -- ESPN's game id (the site's)
  model_version     text        not null,
  game_date         date        not null,
  start_at          timestamptz not null,
  season_type       integer,
  away              text        not null,
  home              text        not null,
  our_margin_home   double precision not null,         -- the model's home margin (points, runs or goals)
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
  primary key (sport, game_id, model_version),
  check (locked_at < start_at)
);
create index if not exists game_line_calls_date_idx on public.game_line_calls (sport, game_date);
create index if not exists game_line_calls_open_idx on public.game_line_calls (start_at) where final_margin_home is null;

create or replace function public.game_line_calls_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if now() >= new.start_at then
      raise exception 'game_line_calls: % % starts at % -- nothing is locked at or after the start', new.sport, new.game_id, new.start_at;
    end if;
    if new.book_taken_at is not null and new.book_taken_at >= new.start_at then
      raise exception 'game_line_calls: the book line was read at or after tip';
    end if;
    new.locked_at := now();
    return new;
  end if;
  if (new.sport, new.game_id, new.model_version, new.game_date, new.start_at, new.season_type, new.away, new.home, new.our_margin_home,
      new.win_share_home, new.basis, new.inputs, new.book_spread_home, new.book_ml_home, new.book_ml_away, new.book_taken_at,
      new.book_event_id, new.locked_at)
     is distinct from
     (old.sport, old.game_id, old.model_version, old.game_date, old.start_at, old.season_type, old.away, old.home, old.our_margin_home,
      old.win_share_home, old.basis, old.inputs, old.book_spread_home, old.book_ml_home, old.book_ml_away, old.book_taken_at,
      old.book_event_id, old.locked_at) then
    raise exception 'game_line_calls: a locked line is never rewritten (new model = new model_version)';
  end if;
  if old.final_margin_home is not null then
    raise exception 'game_line_calls: a graded line is never regraded';
  end if;
  return new;
end $$;

drop trigger if exists game_line_calls_guard on public.game_line_calls;
create trigger game_line_calls_guard before insert or update on public.game_line_calls
  for each row execute function public.game_line_calls_guard();

alter table public.game_line_calls enable row level security;
revoke all on table public.game_line_calls from anon, authenticated;
grant all on table public.game_line_calls to service_role;

-- PROBES (run after, one at a time):
--   select count(*) from public.game_line_calls;                                                     -- expect 0
--   insert into public.odds_game_lines (sport, event_id, game_date, starts_at, snap, taken_at, ml_home, ml_away)
--     values ('nfl', 'PROBE', '2999-01-01', '2999-01-01T00:00:00Z', 'list', '2998-12-31T00:00:00Z', -110, -110);  -- expect INSERT 0 1
--   delete from public.odds_game_lines where event_id = 'PROBE';                                     -- expect DELETE 1
--   insert into public.game_line_calls (sport, game_id, model_version, game_date, start_at, away, home, our_margin_home)
--     values ('nhl', 'PROBE', 'probe', '1970-01-01', '1970-01-01T00:00:00Z', 'AAA', 'BBB', 1);      -- expect ERROR (start in the past)
--   (then the same future insert / rewrite / grade / regrade / delete probes as 202610192100)
