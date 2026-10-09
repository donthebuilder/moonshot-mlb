-- BUCKETS QUICK CALL (2026-10-09). RUN THIS BEFORE THE CODE SHIPS.
--
-- The per-game write-up for basketball (double-double / triple-double) is stored as one homer_feed_posts row,
-- (day, kind) with kind 'writeup_nba_<ESPN event id>', like writeup_nfl_/writeup_nhl_/writeup_mlb_. Without the
-- pattern in the kind whitelist the claim is refused (Postgres 23514) and the write-up silently never posts.
-- The whitelist is APPENDED to, not retyped (the live definition is read and the pattern OR'd onto it, so no
-- kind added by an earlier widen can be lost). Idempotent: a second run sees 'writeup_nba_' and does nothing.
--
-- NOTHING ELSE IS OWED for the double-double / triple-double markets: buckets_log (market text, model_version in the
-- key) takes the new markets 'dd' and 'td' (model_versions buckets-dd-v1, buckets-td-v1) as new rows with no change.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  if position('writeup_nba_' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind ~ ''^writeup_nba_[0-9]+$'')';
  end if;
end $$;

-- PROBES (run after):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect the old list ... OR (kind ~ '^writeup_nba_[0-9]+$'::text)
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'writeup_nba_0', '{}');   -- expect OK
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'writeup_nba_0';                -- expect DELETE 1
