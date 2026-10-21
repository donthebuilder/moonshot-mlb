-- LONGSHOT TUESDAY (2026-10-20, Donovan: "sure"). Two new homer_feed_posts kinds: card_ls_tuesday (the one Tuesday X post with each
-- sport's long shot) and card_ls_tuesday_result (its reply the next day). Same shape as 202610200900_card_nba_on.sql: the live
-- definition plus the new kinds, kept NOT VALID. Idempotent. Run in the Supabase SQL editor, then the PROBE.
-- Until it runs, the Tuesday post's claim is refused and nothing posts (lib/dash/longshotsPost.js postOnce returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('card_ls_tuesday' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ANY (ARRAY[''card_ls_tuesday'',''card_ls_tuesday_result'']))) not valid';
  end if;
end $$;

-- PROBE:
--   select position('card_ls_tuesday' in pg_get_constraintdef(oid)) > 0 as has_tuesday_kinds from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
-- UNDO: nothing to undo for safety (an unused allowed kind is harmless); LONGSHOT_TUESDAY_OFF=on stops the posts.
