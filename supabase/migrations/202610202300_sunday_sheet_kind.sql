-- THE SUNDAY SHEET (2026-10-20, lib/posts/sundaySheet.js): Sunday's TUDDY touchdown board gets its own homer_feed_posts kind, sunday_sheet. Same shape as
-- 202610202200_the_five_kind.sql: the live definition plus the new kind, kept NOT VALID. Idempotent. Run in the Supabase SQL editor, then
-- the PROBE. Until it runs, the claim is refused and nothing posts (postSheetOnce returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('sunday_sheet' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''sunday_sheet'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('sunday_sheet' in pg_get_constraintdef(oid)) > 0 as has_sunday_sheet from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
