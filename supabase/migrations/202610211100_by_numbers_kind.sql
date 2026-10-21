-- BY THE NUMBERS (2026-10-21, lib/posts/byNumbers.js): the nightly numbers-on-tonight's-calls post gets its own homer_feed_posts kind, by_numbers.
-- Same shape as 202610210900_network_vs_board_kind.sql: the live definition plus the new kind, kept NOT VALID. Idempotent. Run in the Supabase
-- SQL editor, then the PROBE. Until it runs, the claim is refused and nothing posts (postNumbersOnce returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('by_numbers' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''by_numbers'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('by_numbers' in pg_get_constraintdef(oid)) > 0 as has_by_numbers from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
