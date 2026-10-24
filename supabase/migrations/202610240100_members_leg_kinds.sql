-- #MEMBERS LIVE CHECK (2026-10-23, lib/card/legsLive.js): a new homer_feed_posts kind family
--   card_members_leg_<sport>_<product>_<slot>_<leg>   one claim per leg of a two-leg members pick (Two-Man, The Double) the moment it lands
-- A one-leg pick (straight, long shot) claims its existing card_members_win_* kind, so it needs nothing here.
-- Same shape as 202610231200_members_wins_kinds.sql: the live definition plus the new family, kept NOT VALID. Idempotent.
-- Until it runs, the two-leg claims are refused (logged) and only those lines are skipped; one-leg picks still post.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('card_members_leg_' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind ~ ''^card_members_leg_(mlb|nfl|nhl|nba|all)_(two_man|double|straight|long_shot)_[0-9]+_[0-9]+$'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('card_members_leg_' in pg_get_constraintdef(oid)) > 0 as has_legs
--     from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
-- UNDO: re-run 202610231200_members_wins_kinds.sql's definition without the card_members_leg_ clause (or leave it: an unused kind costs nothing).
