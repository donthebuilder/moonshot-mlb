-- THE PARTNER FEED (2026-10-23, lib/posts/partnerPack.js): DASH's free posts in other Discord servers get their own homer_feed_posts kinds,
-- one claim a day each: partner_picks (the lead picks, straights + parlay) and partner_top5 (tonight's top 5 per product).
-- Same shape as 202610231200_members_wins_kinds.sql: the live definition plus the new kinds, kept NOT VALID. Idempotent.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('partner_picks' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''partner_picks'') OR (kind = ''partner_top5'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('partner_picks' in pg_get_constraintdef(oid)) > 0 as has_picks, position('partner_top5' in pg_get_constraintdef(oid)) > 0 as has_top5
--     from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true, true
