-- SPORT_PLANS_ON: the ONE "Tonight's plays" post per sport per day (2026-10-16). Claim kind: plays_mlb | plays_nfl | plays_nhl | plays_nba.
-- Idempotent: reads the live check constraint, adds the alternative only if it is missing, NOT VALID (old rows are not re-scanned).
-- RUN BEFORE flipping SPORT_PLANS_ON: with the switch on the old room posts are held back, and the new one cannot be claimed until this has run.
do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one'; end if;
  d := regexp_replace(d, ' NOT VALID$', '');
  if position('''^plays_(mlb|nfl|nhl|nba)$''' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '') || ') or kind ~ ''^plays_(mlb|nfl|nhl|nba)$'') not valid';
  end if;
end $$;

-- PROBE (run after, each as its own run):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- expect ... plays_(mlb|nfl|nhl|nba) ... and every earlier alternative
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'plays_nhl', '{}');   -- expect INSERT 0 1
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'plays_nhl';                  -- expect DELETE 1
