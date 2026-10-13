-- NUMEROLOGY FOR BUCKETS (NBA): THE LANE NIGHTS (2026-10-12, BUCKETS parity pass).
--
-- The three numerology tables (202609280200_numerology.sql) check `sport in ('mlb','nfl','nhl')`. BUCKETS' lane nights (lib/numerology/nbaTick.js, called by
-- the buckets tick) write sport 'nba' ONLY WHILE BUCKETS IS PUBLIC (lib/openSwitch.js bucketsOpen), so this can be run any time before the public flip:
-- nothing writes to it while BUCKETS is hidden. Until it has run, the tick's lane write fails with a clear message, logs it and moves on (the lock and the grade
-- never depend on it).
--
-- WHAT THIS CHANGES (and nothing else): the sport check on numerology_log, numerology_lane_nights and numerology_numbers accepts 'nba'. Rows are never touched.
-- The tables stay service-role only (RLS on, no policy), so an NBA row is not readable by the public key either way.
-- Idempotent: safe to run twice. No role switching.
do $$
declare t text; c record;
begin
  foreach t in array array['numerology_log', 'numerology_lane_nights', 'numerology_numbers'] loop
    -- the original inline check (auto-named <table>_sport_check), found by name and by definition, dropped when it does not mention nba yet
    for c in
      select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
       where conrelid = format('public.%I', t)::regclass and contype = 'c'
         and (conname = t || '_sport_check' or (pg_get_constraintdef(oid) like '%sport%' and pg_get_constraintdef(oid) like '%mlb%' and pg_get_constraintdef(oid) like '%nhl%'))
    loop
      if c.def not like '%nba%' then
        execute format('alter table public.%I drop constraint %I', t, c.conname);
      end if;
    end loop;
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = t || '_sport_check') then
      execute format('alter table public.%I add constraint %I check (sport in (''mlb'', ''nfl'', ''nhl'', ''nba''))', t, t || '_sport_check');
    end if;
  end loop;
end $$;

-- PROBES (run after, each as its own run):
--   select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid in ('public.numerology_log'::regclass, 'public.numerology_lane_nights'::regclass, 'public.numerology_numbers'::regclass) and contype = 'c' and pg_get_constraintdef(oid) like '%sport%';
--     -- expect three rows, each definition lists mlb, nfl, nhl and nba
--   insert into public.numerology_lane_nights (sport, day, lane, eligible, matched) values ('nba', '1970-01-01', 'probe', 0, 0);   -- expect INSERT 0 1
--   delete from public.numerology_lane_nights where day = '1970-01-01' and lane = 'probe';                                         -- expect DELETE 1
--   select count(*) from public.numerology_lane_nights where day = '1970-01-01';                                                  -- expect 0 (the probe leaves nothing behind)
