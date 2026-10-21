-- THE NETWORK vs THE BOARD (2026-10-21, lib/posts/networkVsBoard.js): the weekly poll grade gets its own homer_feed_posts kind, network_vs_board. Same shape as
-- 202610202300_sunday_sheet_kind.sql: the live definition plus the new kind, kept NOT VALID. Idempotent. Run in the Supabase SQL editor, then
-- the PROBE. Until it runs, the claim is refused and nothing posts (postNvbOnce returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('network_vs_board' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''network_vs_board'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('network_vs_board' in pg_get_constraintdef(oid)) > 0 as has_network_vs_board from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
