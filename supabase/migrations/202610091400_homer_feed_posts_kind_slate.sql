-- homer_feed_posts: allow kind 'slate' (THE SLATE, X overhaul stage 3 piece 3, 2026-10-09).
--
-- THE SLATE is one cross-sport post a day that replaces callofnight + pregame + thefour. Its claim row is
-- (day, 'slate') in homer_feed_posts. Until this runs, the claim fails the kind check (Postgres 23514) and
-- the Slate cannot post; the old kinds stay in the check on purpose, so their history rows remain valid.
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS (CLAUDE.md: SQL first), then run the PROBES. Idempotent.
-- Written NOT to restate the whole list: it reads the live constraint and adds one alternative, like
-- 202610050000_writeups.sql did for the writeup_* pattern.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  if position('''slate''' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind = ''slate'')';
  end if;
end $$;

-- PROBES (run after):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect the old list ... OR (kind = 'slate'::text)
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'slate', '{}');   -- expect OK
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'slate';                  -- expect DELETE 1
