-- #MEMBERS LIST (2026-10-25, batch member-requests 2B, lib/card/membersList.js): a new homer_feed_posts kind family
--   card_members_list_<sport>   one claim per sport per card date: the day's plays as ONE #members post, edited in place as the games go
-- Same shape as 202610240100_members_leg_kinds.sql: the live definition plus the new family, kept NOT VALID. Idempotent.
-- Until it runs, the claim is refused (logged) and only the list is skipped; every other #members post is unaffected.
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('card_members_list_' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind ~ ''^card_members_list_(mlb|nfl|nhl|nba)$'')) not valid';
  end if;
end $$;

-- PROBE (expect true):
--   select position('card_members_list_' in pg_get_constraintdef(oid)) > 0 as has_list
--     from pg_constraint where conname = 'homer_feed_posts_kind_check';
-- The `_members_` kinds are already left out of the public read by 202610091200 (a members row never reaches the anon key); confirm with:
--   select count(*) from pg_policies where tablename = 'homer_feed_posts';   -- the same policy set as before
-- UNDO: re-run 202610240100_members_leg_kinds.sql's definition without the card_members_list_ clause (or leave it: an unused kind costs nothing).
