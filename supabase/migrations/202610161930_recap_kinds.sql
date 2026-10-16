-- THE NIGHT RECAP (2026-10-16, lib/posts/recapPost.js): one post per sport per night in #called-it, so its claim row needs its own kind.
--   recap_nfl   the NFL night's recap (claim row: day = the games' own date)
--   recap_nhl   the NHL night's recap
-- homer_feed_posts is keyed (day, kind) and kind is checked. Until this is run the code skips quietly: the claim is refused (Postgres 23514) and nothing is sent.
-- THE RECAP IS ALSO OFF in code until RECAP_POSTS_ON is turned on, so run this first, probe it, then flip the switch.
--
-- Idempotent: reads the live constraint, skips every alternative that is already in it, and adds the rest NOT VALID (new rows are checked, old rows are not
-- re-scanned). A constraint left NOT VALID by an earlier migration is read back without the suffix before it is extended. RUN IT BEFORE THE CODE THAT NEEDS IT.
-- Safe to run twice.

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
      ('''recap_nfl''', 'kind = ''recap_nfl'''),
      ('''recap_nhl''', 'kind = ''recap_nhl''')
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
--     -- expect ... OR (kind = 'recap_nfl'::text) OR (kind = 'recap_nhl'::text) ... NOT VALID
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'recap_nfl', '{}');   -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'recap_nhl', '{}');   -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'recap_nba', '{}');   -- expect ERROR 23514 (BUCKETS has no recap)
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind in ('recap_nfl', 'recap_nhl');   -- expect DELETE 2
