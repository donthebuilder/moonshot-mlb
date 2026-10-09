-- TOP TOTALS (2026-10-09, Donovan: "games with highest totals, like top 3 games, for each sport ... tracked and CALLED").
--
-- One row per game x model_version, written ONCE before the game starts by /api/totals/tick (lib/totals/store.js).
-- Each slate's three games with the highest projected combined count (MLB home runs, NFL touchdowns, NHL goals,
-- NBA points -- the team models' own slate numbers) are CALLED. The LINE is stored with the call: the projection
-- itself (line_source 'projection'); a book total would arrive as 'book', and there is none in the odds data today.
-- The result (actual_total, result over/under/push/void, hit) is written ONCE after the final, with `result is null`.
--
-- GUARDS IN THE DATABASE (the code holds them too):
--   * INSERT is refused at or after start_at, by the database clock; locked_at is stamped by the database.
--   * UPDATE can never change a lock column, and a graded row (result not null) can never change again.
--   * a new model is a new model_version, with new rows.
-- RLS: anyone may read (every row was fixed before its game); only the service role writes.
-- Also appends the four post kinds to homer_feed_posts_kind_check (like 202610091400 did for 'slate').
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS (CLAUDE.md: SQL first). Idempotent: safe to run twice. PROBES at the bottom.

create table if not exists public.top_totals_calls (
  sport           text        not null check (sport in ('mlb','nfl','nhl','nba')),
  game_id         text        not null,
  model_version   text        not null,
  slate_key       text        not null,                 -- the night (YYYY-MM-DD) or the football week (YYYY-wNN)
  game_date       date        not null,                 -- the game's own date, never the wall clock
  start_at        timestamptz not null,
  away            text        not null,
  home            text        not null,
  unit            text,
  projected_total double precision not null,
  line            double precision not null,
  line_source     text        not null default 'projection' check (line_source in ('projection','book')),
  rank            integer     not null check (rank >= 1),
  field_size      integer     not null check (field_size >= 1),
  called          boolean     not null,
  locked_at       timestamptz not null default now(),
  actual_total    double precision,
  result          text        check (result in ('over','under','push','void')),
  hit             boolean,
  graded_at       timestamptz,
  primary key (sport, game_id, model_version),
  check (locked_at < start_at)
);
create index if not exists top_totals_calls_slate_idx on public.top_totals_calls (sport, slate_key, rank);
create index if not exists top_totals_calls_open_idx  on public.top_totals_calls (sport, start_at) where result is null;

create or replace function public.top_totals_calls_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if now() >= new.start_at then
      raise exception 'top_totals_calls: % % starts at % -- nothing is locked at or after the start', new.sport, new.game_id, new.start_at;
    end if;
    new.locked_at := now();
    return new;
  end if;
  -- UPDATE: the lock columns are fixed, the result is written once
  if (new.sport, new.game_id, new.model_version, new.slate_key, new.game_date, new.start_at, new.away, new.home, new.unit,
      new.projected_total, new.line, new.line_source, new.rank, new.field_size, new.called, new.locked_at)
     is distinct from
     (old.sport, old.game_id, old.model_version, old.slate_key, old.game_date, old.start_at, old.away, old.home, old.unit,
      old.projected_total, old.line, old.line_source, old.rank, old.field_size, old.called, old.locked_at) then
    raise exception 'top_totals_calls: a locked call is never rewritten (new model = new model_version)';
  end if;
  if old.result is not null then
    raise exception 'top_totals_calls: a graded call is never regraded';
  end if;
  return new;
end $$;

drop trigger if exists top_totals_calls_guard on public.top_totals_calls;
create trigger top_totals_calls_guard before insert or update on public.top_totals_calls
  for each row execute function public.top_totals_calls_guard();

alter table public.top_totals_calls enable row level security;
drop policy if exists top_totals_calls_read on public.top_totals_calls;
create policy top_totals_calls_read on public.top_totals_calls for select to anon, authenticated using (true);

-- the four post kinds: top_totals (MLB), nfl_top_totals, nhl_top_totals, nba_top_totals (one claim row per day, kind)
do $$
declare d text; k text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  foreach k in array array['top_totals','nfl_top_totals','nhl_top_totals','nba_top_totals'] loop
    if position(('''' || k || '''') in d) = 0 then
      execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
      execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
        || regexp_replace(d, '^CHECK ', '')
        || ') or kind = ' || quote_literal(k) || ')';
      select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
    end if;
  end loop;
end $$;

-- PROBES (run after, one at a time):
--   select count(*) from public.top_totals_calls;                                  -- expect 0 (table exists)
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect ... OR (kind = 'top_totals'::text) OR (kind = 'nfl_top_totals'::text) OR (kind = 'nhl_top_totals'::text) OR (kind = 'nba_top_totals'::text)
--   insert into public.top_totals_calls (sport, game_id, model_version, slate_key, game_date, start_at, away, home, projected_total, line, rank, field_size, called)
--     values ('mlb', 'PROBE', 'probe', '1970-01-01', '1970-01-01', '1970-01-01T00:00:00Z', 'AAA', 'BBB', 1, 1, 1, 1, false);   -- expect ERROR (start in the past)
--   insert into public.top_totals_calls (sport, game_id, model_version, slate_key, game_date, start_at, away, home, projected_total, line, rank, field_size, called)
--     values ('mlb', 'PROBE', 'probe', '2999-01-01', '2999-01-01', '2999-01-01T00:00:00Z', 'AAA', 'BBB', 1, 1, 1, 1, false);   -- expect INSERT 0 1
--   update public.top_totals_calls set rank = 2 where model_version = 'probe';                                                   -- expect ERROR (never rewritten)
--   update public.top_totals_calls set actual_total = 2, result = 'over', hit = true, graded_at = now() where model_version = 'probe';  -- expect UPDATE 1
--   update public.top_totals_calls set actual_total = 0, result = 'under', hit = false where model_version = 'probe';            -- expect ERROR (graded once)
--   delete from public.top_totals_calls where model_version = 'probe';                                                           -- expect DELETE 1
