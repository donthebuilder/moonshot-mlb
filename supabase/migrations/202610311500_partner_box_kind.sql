-- THE PARTNER BOX (2026-10-31, lib/posts/partnerPack.js, PARTNER_BOX_ON): picks + top 5 become ONE post a day, kind partner_box.
-- Same shape as 202610231800_partner_kinds.sql: the live definition plus the new kind, kept NOT VALID. Idempotent. Runs BEFORE the switch goes on.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conname = 'homer_feed_posts_kind_check' and conrelid = 'public.homer_feed_posts'::regclass;
  if d is not null and position('partner_box' in d) = 0 then
    d := regexp_replace(d, '^CHECK \((.*)\)( NOT VALID)?$', '\1');
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (' || d
      || ' OR (kind = ''partner_box'')) not valid';
  end if;
end $$;

-- PROBE:
--   select position('partner_box' in pg_get_constraintdef(oid)) > 0 as has_box, position('partner_picks' in pg_get_constraintdef(oid)) > 0 as still_has_picks
--     from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- true, true
