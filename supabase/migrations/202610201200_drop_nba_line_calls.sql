-- DROP THE EMPTY nba_line_calls (2026-10-20, Donovan: "lets handle this"). It was BUCKETS' first lock table
-- (202610192100); since #157 every sport, BUCKETS included, locks into game_line_calls and nothing reads this one.
-- Refuses to run if a single row is in it (a row would be a lock, and locks are never thrown away).
do $$
begin
  if to_regclass('public.nba_line_calls') is null then
    raise notice 'nba_line_calls already gone';
    return;
  end if;
  if exists (select 1 from public.nba_line_calls) then
    raise exception 'nba_line_calls has rows -- not dropped; look before deleting anything';
  end if;
  drop table public.nba_line_calls;
  drop function if exists public.nba_line_calls_guard();
end $$;

-- PROBE: select to_regclass('public.nba_line_calls');   -- expect null
