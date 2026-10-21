-- THE FIVE (2026-10-20, lib/posts/theFive.js): Friday's five CALLED names get their own homer_feed_posts kind, the_five. Same shape as
-- 202610202100_film_room_kind.sql: the live definition plus the new kind, kept NOT VALID. Idempotent. Run in the Supabase SQL editor, then
-- the PROBE. Until it runs, the claim is refused and nothing posts (postFiveOnce returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('the_five' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''the_five'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('the_five' in pg_get_constraintdef(oid)) > 0 as has_the_five from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
