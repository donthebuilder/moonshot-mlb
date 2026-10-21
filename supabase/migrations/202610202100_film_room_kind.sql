-- FILM ROOM (2026-10-20, lib/posts/filmRoom.js): Wednesday's explainer gets its own homer_feed_posts kind, film_room. Same shape as
-- 202610202000_longshot_tuesday_kinds.sql: the live definition plus the new kind, kept NOT VALID. Idempotent. Run in the Supabase
-- SQL editor, then the PROBE. Until it runs, the claim is refused and nothing posts (postFilmRoomOnce returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('film_room' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''film_room'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('film_room' in pg_get_constraintdef(oid)) > 0 as has_film_room from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
