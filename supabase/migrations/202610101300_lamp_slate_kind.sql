-- homer_feed_posts: allow kind 'nhl_slate' (THE LAMP SLATE, 2026-10-10, lib/posts/lampSlate.js).
--
-- THE LAMP SLATE is one NHL post a night naming the night's top CALLED skaters, posted after the NHL lock and before the
-- first puck. Its claim row is (day, 'nhl_slate') in homer_feed_posts. Until this runs, the claim fails the kind check
-- (Postgres 23514) and the post cannot go out (the tick logs the refusal; nothing else is touched).
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS (CLAUDE.md: SQL first), then run the PROBES. Idempotent. Reads the live
-- constraint and adds one alternative. The check is added NOT VALID, as the Card-map migration had to (a stray old row
-- failed the full re-check with 23514 on 2026-10-10): new rows are checked, old rows are not re-scanned.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  d := regexp_replace(d, ' NOT VALID$', '');   -- an earlier NOT VALID add (the Card-map migration) leaves the suffix on the live definition
  if position('''nhl_slate''' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind = ''nhl_slate'') not valid';
  end if;
end $$;

-- PROBES (run after, one at a time; each as its own run):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect the old list ... OR (kind = 'nhl_slate'::text) ... NOT VALID
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'nhl_slate', '{}');   -- expect INSERT 0 1
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'nhl_slate';                  -- expect DELETE 1
