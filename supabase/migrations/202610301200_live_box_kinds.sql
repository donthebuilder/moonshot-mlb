-- THE LIVE BOX (2026-10-30, lib/dash/liveBox.js): a new homer_feed_posts kind family
--   live_box_<sport>   one claim per sport per game date: the night's live moments as ONE Discord message per room, edited in place
-- Same shape as 202610260100_members_list_kinds.sql: the live definition plus the new family, kept NOT VALID. Idempotent.
-- Until it runs, the claim is refused (logged) and the callers post each moment the old way. RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('live_box_' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind ~ ''^live_box_(mlb|nfl|nhl|nba)$'')) not valid';
  end if;
end $$;

-- PROBE (expect true):
--   select position('live_box_' in pg_get_constraintdef(oid)) > 0 as has_live_box
--     from pg_constraint where conname = 'homer_feed_posts_kind_check';
-- UNDO: re-run the previous definition without the live_box_ clause (or leave it: an unused kind costs nothing).
