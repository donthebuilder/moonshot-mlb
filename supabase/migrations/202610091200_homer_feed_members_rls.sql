-- homer_feed_posts: keep MEMBERS rows off the public read (2026-10-09, Discord audit L3).
--
-- Problem: policy homer_feed_posts_read_all was `using (true)`, so anyone with the
-- public anon key could read the members rows (kinds nfl_members_board,
-- nfl_members_grade, mlb_members_board, mlb_members_grade), whose payload holds the
-- full pick list and the "why" lines -- the paid content.
--
-- Fix: the public/authenticated read policy now excludes every kind containing
-- "_members_" (exactly the four MEMBERS_KINDS in lib/dash/membersPost.js, and any
-- future members kind named the same way). service_role bypasses RLS, so the
-- ticks, /admin and the members grade read-back keep full access.
--
-- Site readers checked (see report): the only anon-key readers are app/called/page.js
-- (kinds nfl_board, nfl_results, pregame) and app/api/dash/homers/card (pregame).
-- None reads a members kind. Everything else uses the service role.
--
-- Donovan runs this in the Supabase SQL editor, then the PROBE at the bottom.
-- Idempotent: safe to run twice.

alter table public.homer_feed_posts enable row level security;

drop policy if exists homer_feed_posts_read_all on public.homer_feed_posts;
drop policy if exists homer_feed_posts_read_public on public.homer_feed_posts;
create policy homer_feed_posts_read_public on public.homer_feed_posts
  for select to anon, authenticated
  using (kind not like '%\_members\_%');

-- ---------------------------------------------------------------------------
-- PROBE (run after the above, in the SQL editor).
-- Expected: members_readable = 0 and public_readable > 0.
set role anon;
select
  (select count(*) from public.homer_feed_posts where kind like '%\_members\_%') as members_readable,   -- must be 0
  (select count(*) from public.homer_feed_posts where kind not like '%\_members\_%') as public_readable; -- must be > 0
-- then, as a SEPARATE run, put the editor back to its own role:
--   reset role;
-- and to see the policy:
--   select policyname, roles, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'homer_feed_posts';
