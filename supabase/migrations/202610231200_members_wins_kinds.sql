-- #MEMBERS WINS AND THE MORNING GRADE (2026-10-23, lib/card/wins.js): new homer_feed_posts kinds
--   card_members_win_<sport>_<product>_<slot>   one claim per Card pick announced as a hit (day = the card date)
--   card_members_graded                          the morning grade of a game day's picks
-- Same shape as 202610211100_by_numbers_kind.sql: the live definition plus the new kinds, kept NOT VALID. Idempotent.
-- Until it runs, the claims are refused and nothing posts (postMembersWins returns 'claim-failed').

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('card_members_graded' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''card_members_graded'') OR (kind ~ ''^card_members_win_(mlb|nfl|nhl|nba|all)_(straight|two_man|double|long_shot)_[0-9]+$'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('card_members_graded' in pg_get_constraintdef(oid)) > 0 as has_graded,
--          position('card_members_win_' in pg_get_constraintdef(oid)) > 0 as has_wins
--     from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true, true
