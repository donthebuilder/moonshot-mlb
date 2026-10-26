-- THE PUBLIC KEY COULD READ PAID WRITE-UPS (2026-10-26, Supabase audit). homer_feed_posts_read_public only hid kinds shaped
-- '%\_members\_%'. Read as the anon role it still returned 197 paid write-ups (kind 'writeup_<sport>_<game>'), 19 'members_roundup_*'
-- rows and 9 'nfl_whyboard' posts. The site reads this table with the service key, which ignores RLS, so nothing the site shows changes.
-- Now the public sees a row only when it is not members content AND, if it is a write-up, only when payload.free is 'true'
-- (no write-up has that flag today, so every write-up is members-only until one is marked free). nfl_whyboard is members-only in
-- lib/dash/routing.js.
-- RUN: applied live 2026-10-26 (by Claude, Donovan's go-ahead). Idempotent: drop + create.
-- PROBE (as the logged-out role; must print 0 / 0 / 0):
--   do $$ declare a int; b int; c int; begin set local role anon;
--     select count(*) into a from public.homer_feed_posts where kind like 'writeup%' and coalesce(payload->>'free','false') <> 'true';
--     select count(*) into b from public.homer_feed_posts where kind ilike '%members%';
--     select count(*) into c from public.homer_feed_posts where kind = 'nfl_whyboard'; reset role;
--     raise notice 'paid writeups %, members rows %, whyboard %', a, b, c; end $$;
-- UNDO: drop policy if exists homer_feed_posts_read_public on public.homer_feed_posts;
--       create policy homer_feed_posts_read_public on public.homer_feed_posts for select to anon, authenticated
--         using (kind !~~ '%\_members\_%');
drop policy if exists homer_feed_posts_read_public on public.homer_feed_posts;

create policy homer_feed_posts_read_public
  on public.homer_feed_posts
  for select
  to anon, authenticated
  using (
    kind not ilike '%members%'
    and kind <> 'nfl_whyboard'
    and (
      kind not like 'writeup\_%'
      or coalesce(payload->>'free', 'false') = 'true'
    )
  );
