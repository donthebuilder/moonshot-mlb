-- MEMBERS FOLDS (2026-10-16, Donovan: one #members briefing a day, one write-up roundup a night per sport).
-- homer_feed_posts is keyed (day, kind) and kind is checked. The nightly write-up roundup claims its own row:
--   members_roundup_nhl | members_roundup_nfl | members_roundup_nba
-- Until this is run the roundup's claim is refused (Postgres 23514), the log says "kind not allowed yet (run <this file>)", and nothing is sent.
-- THE FOLD IS ALSO OFF in code until MEMBERS_FOLDS_ON is turned on, so run this first, probe it, then flip the switch.
-- (THE DAY's briefing uses card_members_day, which already exists.)
--
-- Idempotent: reads the live constraint, skips what is already in it, adds the rest NOT VALID (new rows are checked, old rows are not re-scanned).
-- RUN IT BEFORE THE CODE THAT NEEDS IT. Safe to run twice.

do $$
declare d text; r record;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  d := regexp_replace(d, ' NOT VALID$', '');
  for r in
    select probe, expr from (values
      ('''members_roundup_nhl''', 'kind = ''members_roundup_nhl'''),
      ('''members_roundup_nfl''', 'kind = ''members_roundup_nfl'''),
      ('''members_roundup_nba''', 'kind = ''members_roundup_nba''')
    ) as t(probe, expr)
  loop
    if position(r.probe in d) = 0 then
      execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
      execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
        || regexp_replace(d, '^CHECK ', '')
        || ') or ' || r.expr || ') not valid';
      select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
      d := regexp_replace(d, ' NOT VALID$', '');
    end if;
  end loop;
end $$;

-- PROBES (run after, each as its own run):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect it to contain  (kind = 'members_roundup_nhl'::text)  (kind = 'members_roundup_nfl'::text)  (kind = 'members_roundup_nba'::text)
--   select count(*) from pg_constraint where conname = 'homer_feed_posts_kind_check'
--     and pg_get_constraintdef(oid) like '%members_roundup_nhl%' and pg_get_constraintdef(oid) like '%members_roundup_nfl%' and pg_get_constraintdef(oid) like '%members_roundup_nba%';   -- expect 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'members_roundup_nhl', '{}');   -- expect INSERT 0 1
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'members_roundup_nhl';                  -- expect DELETE 1
