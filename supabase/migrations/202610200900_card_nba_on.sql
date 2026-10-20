-- THE CARD TURNS ON FOR BUCKETS (2026-10-20, Donovan: "turn it on"; BUCKETS public since 04:10Z). Undoes, for The Card only, the
-- hidden-sport guards the Card tables were built with. Idempotent. Run in the Supabase SQL editor, then the PROBES.
--   1. card_calls_read: the same policy as 202610121000_card_calls_members.sql without its `sport <> 'nba'` guard.
--   2. card_tracked: 'nba' joins the sport check; card_tracked_read loses its `sport <> 'nba'` guard.
--   3. card_issues: drops card_issues_not_hidden ("no real NBA card can be issued until this line is dropped on purpose").
--   4. homer_feed_posts_kind_check: the live definition plus the NBA Card post kinds (card_nba, card_result_nba, card_members_nba,
--      card_ls_nba, card_ls_result_nba, card_don_nba, card_don_nba_<entry>), kept NOT VALID as it is.
-- The NBA Card's RECORD numbers stay behind the 30-night public-number floor in code (lib/card/store.js nbaFloored).

alter table public.card_calls enable row level security;
drop policy if exists card_calls_read on public.card_calls;
create policy card_calls_read on public.card_calls for select to anon, authenticated
  using (
    (lane = 'donovan' and now() >= locks_at)
    or (lane = 'bot' and (
          product = 'long_shot'
          or (product = 'double' and result is not null)
          or (product in ('straight', 'two_man') and (
                public.card_calls_revealed(sport, card_date)
                or (product = 'straight' and id = public.card_calls_free_id(sport, card_date))
             ))
       ))
  );

alter table public.card_tracked drop constraint if exists card_tracked_sport_check;
alter table public.card_tracked add constraint card_tracked_sport_check check (sport in ('mlb', 'nfl', 'nhl', 'nba'));
drop policy if exists card_tracked_read on public.card_tracked;
create policy card_tracked_read on public.card_tracked for select to anon, authenticated
  using (result is not null);

alter table public.card_issues drop constraint if exists card_issues_not_hidden;

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('card_nba' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ANY (ARRAY[''card_nba'',''card_result_nba'',''card_members_nba'',''card_ls_nba'',''card_ls_result_nba'',''card_don_nba'']))'
      || ' OR (kind ~ ''^card_don_nba_[a-z0-9_]+$'')) not valid';
  end if;
end $$;

-- PROBES (each as its own run):
--   select policyname, qual from pg_policies where schemaname = 'public' and tablename in ('card_calls','card_tracked');   -- no 'nba' left in either qual
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.card_tracked'::regclass, 'public.card_issues'::regclass) and contype = 'c';   -- tracked check has nba; no card_issues_not_hidden
--   select position('card_nba' in pg_get_constraintdef(oid)) > 0 as has_nba_kinds from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true
